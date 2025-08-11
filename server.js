require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
const allowedOrigin = process.env.CORS_ORIGIN || 'https://nickg-hm.github.io';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function extractNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || null;
}

async function fetchShopifyOrderByName(orderName) {
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN; // e.g., mystore.myshopify.com
  const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !adminToken) {
    throw new Error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN in environment');
  }

  const url = `https://${shopDomain}/admin/api/2024-07/graphql.json`;
  const query = `
    query($search: String!) {
      orders(first: 1, query: $search) {
        edges {
          node {
            id
            name
            fulfillments {
              trackingInfo {
                number
                company
                url
              }
            }
          }
        }
      }
    }
  `;

  const variables = { search: `name:${orderName}` };

  const resp = await axios.post(
    url,
    { query, variables },
    {
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  if (resp.data.errors) {
    throw new Error('Shopify GraphQL error: ' + JSON.stringify(resp.data.errors));
  }

  const edges = resp?.data?.data?.orders?.edges || [];
  const node = edges[0]?.node;
  if (!node) {
    return { orderGid: null, orderNumericId: null, trackingNumber: null };
  }

  const orderGid = node.id;
  const orderNumericId = extractNumericIdFromGid(orderGid);

  let trackingNumber = null;
  const fulfillments = node.fulfillments || [];
  if (fulfillments.length > 0 && fulfillments[0].trackingInfo && fulfillments[0].trackingInfo.length > 0) {
    trackingNumber = fulfillments[0].trackingInfo[0].number || null;
  }

  return { orderGid, orderNumericId, trackingNumber };
}

async function fetchTrack123ByOrderId(orderNumericId) {
  const uuid = process.env.TRACK123_UUID; // myshopify subdomain, e.g., mystore
  const apiKey = process.env.TRACK123_API_KEY;
  if (!uuid || !apiKey) {
    throw new Error('Missing TRACK123_UUID or TRACK123_API_KEY in environment');
  }

  const url = `https://shp.track123.com/shopify/api/v1/${encodeURIComponent(uuid)}/orders/${encodeURIComponent(orderNumericId)}.json`;

  const resp = await axios.get(url, {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const order = resp?.data?.order || {};
  const brandedTrackingLink = order?.tracking_link || null;
  const fulfillments = order.fulfillments || [];
  const first = fulfillments[0] || {};
  const trackingNumber = first.tracking_number || null;
  const carrierCode = first?.carrier_code || null;
  const courier = first?.courier || {};
  const courierCode = courier?.code || carrierCode || null;
  const courierName = courier?.name || null;
  const rawQueryLink = courier?.query_link ?? null;
  const courierQueryLink = rawQueryLink && String(rawQueryLink).trim() !== '' ? rawQueryLink : null;
  const courierHomePage = courier?.home_page || null;

  const lastMile = first?.last_mile_info || null;
  const lmTrackNo = lastMile?.lm_track_no || null;
  const lmProviderCode = lastMile?.lm_track_no_provider_code || null;
  const lmProviderName = lastMile?.lm_track_no_provider_name || null;
  const lastMileQueryLink = lastMile?.query_link || null;

  return {
    trackingNumber,
    courierQueryLink,
    lastMileQueryLink,
    courierHomePage,
    brandedTrackingLink,
    courierCode,
    courierName,
    lmTrackNo,
    lmProviderCode,
    lmProviderName,
  };
}

function normalizeCarrier(value) {
  return (value || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildOfficialCarrierUrl({
  courierCode,
  courierName,
  lmProviderCode,
  lmProviderName,
  trackingNumber,
  lastMileTrackingNumber,
}) {
  const code = normalizeCarrier(lmProviderCode || courierCode);
  const name = normalizeCarrier(lmProviderName || courierName);
  const tn = lastMileTrackingNumber || trackingNumber;
  if (!tn) return null;

  // USPS
  if (code.includes('usps') || name.includes('usps') || name.includes('unitedstatespostalservice')) {
    return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(tn)}`;
  }

  // UPS
  if (code === 'ups' || name.includes('ups')) {
    return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(tn)}`;
  }

  // FedEx
  if (code.includes('fedex') || name.includes('fedex')) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
  }

  // DHL Express
  if (code === 'dhl' || code === 'dhlexpress' || name.includes('dhlexpress')) {
    return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tn)}`;
  }

  // DHL eCommerce
  if (code.includes('dhlecommerce') || name.includes('dhlecommerce')) {
    return `https://www.dhl.com/us-en/home/tracking/tracking-ecommerce.html?tracking-id=${encodeURIComponent(tn)}`;
  }

  // Canada Post
  if (code.includes('canadapost') || name.includes('canadapost') || name.includes('postescanada')) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(tn)}`;
  }

  // Royal Mail
  if (code.includes('royalmail') || name.includes('royalmail')) {
    return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tn)}`;
  }

  // Australia Post (AusPost)
  if (code.includes('auspost') || code.includes('australiapost') || name.includes('auspost') || name.includes('australiapost')) {
    return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(tn)}`;
  }

  // YunExpress
  if (code.includes('yunexpress') || name.includes('yunexpress')) {
    return `https://www.yuntrack.com/Track/Detail/${encodeURIComponent(tn)}`;
  }

  return null;
}

function isRealCarrierLink(link) {
  if (!link || typeof link !== 'string') return false;
  const trimmed = link.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  // Reject template placeholders
  if (trimmed.includes('#{') || trimmed.toLowerCase().includes('{trackingno') || trimmed.includes('${')) return false;
  return true;
}

// Heuristic guess by tracking number shape
function guessCarrierByTrackingNumber(trackingNumber) {
  const tn = String(trackingNumber || '').trim().toUpperCase();
  if (!tn) return null;
  // USPS: 22-digit starting 92/93/94/95, or S10 ending US
  if (/^(92|93|94|95)\d{18,22}$/.test(tn) || /^[A-Z]{2}\d{9}US$/.test(tn)) return 'usps';
  // AusPost: S10 ending AU
  if (/^[A-Z]{2}\d{9}AU$/.test(tn)) return 'auspost';
  return null;
}

function buildUrlByGuessedCarrier(guess, trackingNumber) {
  if (!guess || !trackingNumber) return null;
  const tn = encodeURIComponent(trackingNumber);
  if (guess === 'usps') return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${tn}`;
  if (guess === 'auspost') return `https://auspost.com.au/mypost/track/#/details/${tn}`;
  return null;
}


app.post('/api/links', async (req, res) => {
  try {
    let { orderName } = req.body;

    if (!orderName || typeof orderName !== 'string') {
      return res.status(400).json({ error: 'orderName is required, e.g., "#121543"' });
    }

    orderName = orderName.trim();
    if (!orderName.startsWith('#')) {
      orderName = `#${orderName}`;
    }

    const { orderNumericId, trackingNumber: trackingFromShopify } = await fetchShopifyOrderByName(orderName);

    if (!orderNumericId) {
      return res.status(404).json({ error: 'Order not found in Shopify by name' });
    }

    const track123 = await fetchTrack123ByOrderId(orderNumericId);

    const trackingNumber = trackingFromShopify || track123.lmTrackNo || track123.trackingNumber || null;

    // Prefer official carrier URL using last-mile number when available
    const officialUrl = buildOfficialCarrierUrl({
      courierCode: track123.courierCode,
      courierName: track123.courierName,
      lmProviderCode: track123.lmProviderCode,
      lmProviderName: track123.lmProviderName,
      trackingNumber,
      lastMileTrackingNumber: track123.lmTrackNo,
    });

    let primaryLink = null;
    if (officialUrl) {
      primaryLink = officialUrl;
    } else {
      const guessed = guessCarrierByTrackingNumber(trackingNumber);
      const guessedUrl = buildUrlByGuessedCarrier(guessed, trackingNumber);
      if (guessedUrl) {
        primaryLink = guessedUrl;
      } else if (isRealCarrierLink(track123.courierQueryLink)) {
        primaryLink = track123.courierQueryLink;
      } else if (isRealCarrierLink(track123.lastMileQueryLink)) {
        primaryLink = track123.lastMileQueryLink;
      } else {
        primaryLink = track123.brandedTrackingLink || track123.courierHomePage || null;
      }
    }

    const parcelsLink = trackingNumber
      ? `https://parcelsapp.com/en/tracking/${encodeURIComponent(trackingNumber)}`
      : null;

    return res.json({
      orderNumericId,
      trackingNumber: trackingNumber || null,
      courierQueryLink: primaryLink,
      parcelsLink,
    });
  } catch (err) {
    const message = err?.response?.data || err.message || 'Unknown error';
    return res.status(500).json({ error: message });
  }
});



app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Track123 minimal app listening on http://localhost:${PORT}`);
}); 