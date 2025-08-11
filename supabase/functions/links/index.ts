const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://nickg-hm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractNumericIdFromGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orderName } = await req.json();
    if (!orderName || typeof orderName !== "string") {
      return new Response(
        JSON.stringify({ error: 'orderName is required, e.g., "#121543"' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    const SHOPIFY_ADMIN_ACCESS_TOKEN = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const TRACK123_UUID = Deno.env.get("TRACK123_UUID");
    const TRACK123_API_KEY = Deno.env.get("TRACK123_API_KEY");

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN || !TRACK123_UUID || !TRACK123_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing required server secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const name = orderName.startsWith("#") ? orderName : `#${orderName}`;

    // Shopify: find order by name
    const sResp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `query($search: String!) {
          orders(first: 1, query: $search) {
            edges { node { id name fulfillments { trackingInfo { number company url } } } }
          }
        }`,
        variables: { search: `name:${name}` },
      }),
    });
    const sJson = await sResp.json();
    const node = sJson?.data?.orders?.edges?.[0]?.node;
    if (!node) {
      return new Response(
        JSON.stringify({ error: "Order not found in Shopify by name" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orderGid: string = node.id;
    const orderNumericId = extractNumericIdFromGid(orderGid);
    const trackingFromShopify: string | null =
      node?.fulfillments?.[0]?.trackingInfo?.[0]?.number ?? null;

    // Track123: details
    const tResp = await fetch(
      `https://shp.track123.com/shopify/api/v1/${encodeURIComponent(TRACK123_UUID)}/orders/${encodeURIComponent(orderNumericId!)}.json`,
      { headers: { "X-Api-Key": TRACK123_API_KEY, "Content-Type": "application/json" } }
    );
    const tJson = await tResp.json();
    const order = tJson?.order ?? {};
    const first = (order?.fulfillments ?? [])[0] ?? {};
    const trackingNumber = trackingFromShopify ?? first?.tracking_number ?? null;

    const courier = first?.courier ?? {};
    const courierQueryLink = courier?.query_link || null;
    const brandedTrackingLink = order?.tracking_link ?? null;
    const courierHomePage = courier?.home_page ?? null;

    const primaryLink =
      courierQueryLink || brandedTrackingLink || courierHomePage || null;

    const parcelsLink = trackingNumber
      ? `https://parcelsapp.com/en/tracking/${encodeURIComponent(trackingNumber)}`
      : null;

    return new Response(
      JSON.stringify({ orderNumericId, trackingNumber, courierQueryLink: primaryLink, parcelsLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error)?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}); 