const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractNumericIdFromGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || null;
}

// Fetch orders by customer email from Shopify
async function fetchOrdersByEmail(email: string, shopDomain: string, adminToken: string): Promise<any[]> {
  const resp = await fetch(`https://${shopDomain}/admin/api/2024-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminToken,
    },
    body: JSON.stringify({
      query: `query($search: String!) {
        orders(first: 10, query: $search, sortKey: CREATED_AT, reverse: true) {
          edges { 
            node { 
              id 
              name 
              createdAt
              fulfillments { 
                trackingInfo { number company url } 
              } 
            } 
          }
        }
      }`,
      variables: { search: `email:${email}` },
    }),
  });
  
  const json = await resp.json();
  const edges = json?.data?.orders?.edges || [];
  
  return edges.map((edge: any) => {
    const node = edge.node;
    const orderNumericId = extractNumericIdFromGid(node.id);
    const trackingNumber = node?.fulfillments?.[0]?.trackingInfo?.[0]?.number ?? null;
    
    return {
      orderName: node.name,
      orderNumericId,
      trackingNumber,
      createdAt: node.createdAt
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { orderName, email } = body;
    
    const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    const SHOPIFY_ADMIN_ACCESS_TOKEN = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const TRACK123_UUID = Deno.env.get("TRACK123_UUID");
    const TRACK123_API_KEY = Deno.env.get("TRACK123_API_KEY");

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Missing required server secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If email is provided, search orders by email
    if (email && typeof email === "string") {
      const orders = await fetchOrdersByEmail(email.trim().toLowerCase(), SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN);
      
      if (!orders || orders.length === 0) {
        return new Response(
          JSON.stringify({ error: "No orders found for this email", orders: [] }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ email, orders, latestOrder: orders[0] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Otherwise, search by orderName (original logic)
    if (!orderName || typeof orderName !== "string") {
      return new Response(
        JSON.stringify({ error: 'orderName or email is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!TRACK123_UUID || !TRACK123_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing Track123 secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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