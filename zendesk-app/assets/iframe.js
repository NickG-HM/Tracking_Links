(function() {
  'use strict';

  const client = ZAFClient.init();
  // Supabase Edge Function endpoint for API
  const apiBaseUrl = 'https://lrjemtcgiiscpfzypftx.supabase.co/functions/v1/links';

  // Helper function to extract order ID from text
  function extractOrderId(text) {
    if (!text) return null;
    
    // Match patterns like #141906 or # 141906 (at least 4 digits)
    let match = text.match(/#\s*(\d{4,})/);
    if (match) return `#${match[1]}`;
    
    // Match "order 141906" or "order: 141906" patterns
    match = text.match(/order\s*:?\s*(\d{4,})/i);
    if (match) return `#${match[1]}`;
    
    return null;
  }

  // Get order ID by fetching orders from Shopify API using requester's email
  async function getOrderIdByEmail() {
    try {
      console.log('Getting order ID by requester email...');
      
      // Get requester email from ticket
      const ticketData = await client.get(['ticket.requester']);
      const requester = ticketData['ticket.requester'];
      
      if (!requester || !requester.email) {
        console.log('No requester email found');
        return null;
      }
      
      const email = requester.email;
      console.log('Requester email:', email);
      
      // Call Supabase API to get orders by email
      console.log('Calling API:', apiBaseUrl);
      
      const response = await fetch(apiBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log('API error:', errorData);
        return null;
      }
      
      const data = await response.json();
      console.log('Orders by email response:', data);
      
      if (data.latestOrder && data.latestOrder.orderName) {
        const orderName = data.latestOrder.orderName;
        console.log('Found latest order:', orderName);
        return orderName;
      }
      
      if (data.orders && data.orders.length > 0) {
        const orderName = data.orders[0].orderName;
        console.log('Found first order:', orderName);
        return orderName;
      }
      
      console.log('No orders found for email');
      return null;
    } catch (error) {
      console.error('Error getting order by email:', error);
      return null;
    }
  }

  // Detect order ID - uses email-based lookup from Shopify
  async function detectOrderIdFromTicket() {
    try {
      console.log('Detecting order ID...');
      
      // Get order ID by requester email (calls Shopify API)
      const orderId = await getOrderIdByEmail();
      if (orderId) {
        console.log('Found order ID by email:', orderId);
        return orderId;
      }

      console.log('No order ID found');
      return null;
    } catch (error) {
      console.error('Error detecting order ID:', error);
      return null;
    }
  }

  // SVG copy icon
  function svgCopy() {
    return '<svg class="copy-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v-2h2V7h-6v2H9Z"/><path d="M5 9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Zm2 0v8h6V9H7Z"/></svg>';
  }

  // Copy text to clipboard
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  }

  // Check if URL is valid
  function isRealUrl(link) {
    if (!link || typeof link !== 'string') return false;
    const trimmed = link.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    if (trimmed.includes('#{') || trimmed.includes('${') || trimmed.toLowerCase().includes('{trackingno')) return false;
    return true;
  }

  // Resolve tracking template placeholders
  function resolveTrackingTemplate(rawUrl, trackingNumber) {
    if (!rawUrl || !trackingNumber) return rawUrl;
    let url = String(rawUrl);
    const tn = encodeURIComponent(String(trackingNumber));
    const patterns = [
      /#\{\s*(tracking(?:_?number|_?no|_?num|_?id|_?code)|awb|waybill|consignment|parcel(?:_?id)?)\s*\}/gi,
      /\$\{\s*(tracking(?:_?number|_?no|_?num|_?id|_?code)|awb|waybill|consignment|parcel(?:_?id)?)\s*\}/gi,
      /\{\s*(tracking(?:_?number|_?no|_?num|_?id|_?code)|awb|waybill|consignment|parcel(?:_?id)?)\s*\}/gi,
    ];
    for (const rx of patterns) {
      url = url.replace(rx, tn);
    }
    return url;
  }

  // Show toast message
  function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.className = 'toast' + (isError ? ' error' : '');
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }
  }

  // Initialize app
  async function init() {
    const form = document.getElementById('trackForm');
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const orderNameInput = document.getElementById('orderName');

    // Try to pre-fill order ID from ticket (by email lookup)
    let detectedOrderId = await detectOrderIdFromTicket();
    if (detectedOrderId) {
      orderNameInput.value = detectedOrderId;
    } else {
      // Retry up to 3 times with 2 second intervals
      let retryCount = 0;
      const maxRetries = 3;
      const retryInterval = 2000; // 2 seconds
      
      const retryDetection = setInterval(async () => {
        retryCount++;
        detectedOrderId = await detectOrderIdFromTicket();
        
        if (detectedOrderId && !orderNameInput.value) {
          orderNameInput.value = detectedOrderId;
          clearInterval(retryDetection);
        } else if (retryCount >= maxRetries) {
          clearInterval(retryDetection);
        }
      }, retryInterval);
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      output.style.display = 'none';
      output.innerHTML = '';
      status.textContent = 'Loading...';
      status.className = 'status';

      const orderNameRaw = orderNameInput.value.trim();
      const orderName = orderNameRaw.startsWith('#') ? orderNameRaw : `#${orderNameRaw}`;

      try {
        const response = await fetch(apiBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderName })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Request failed');
        }

        const data = await response.json();
        status.textContent = '';
        status.className = 'status';

        const trackingNumber = data.trackingNumber || '';
        const resolvedCourier = resolveTrackingTemplate(data.courierQueryLink, trackingNumber);
        const firstLink = isRealUrl(resolvedCourier)
          ? resolvedCourier
          : (isRealUrl(data.courierQueryLink) ? data.courierQueryLink : null);
        const secondLink = isRealUrl(data.parcelsLink) ? data.parcelsLink : null;

        const blocks = [];

        if (firstLink) {
          blocks.push(`
            <div class="section block">
              <div class="label">Carrier</div>
              <div class="link-row">
                <button class="copy-btn" data-copy="${firstLink.replace(/"/g, '&quot;')}" aria-label="Copy carrier link">
                  ${svgCopy()}<span>Copy</span>
                </button>
                <a class="link" href="${firstLink}" target="_blank" rel="noopener noreferrer">${firstLink}</a>
              </div>
            </div>
          `);
        }

        if (secondLink) {
          blocks.push(`
            <div class="section block">
              <div class="label">Universal Search</div>
              <div class="link-row">
                <button class="copy-btn" data-copy="${secondLink.replace(/"/g, '&quot;')}" aria-label="Copy universal link">
                  ${svgCopy()}<span>Copy</span>
                </button>
                <a class="link" href="${secondLink}" target="_blank" rel="noopener noreferrer">${secondLink}</a>
              </div>
            </div>
          `);
        }

        if (firstLink || secondLink) {
          const both = [firstLink, secondLink].filter(Boolean).join('\n');
          blocks.push(`
            <div class="section">
              <button class="btn secondary full" id="copyBoth" data-copy="${both.replace(/"/g, '&quot;')}">
                ${svgCopy()}<span>Copy both links</span>
              </button>
              <div id="toast" class="toast"></div>
            </div>
          `);
        } else {
          blocks.push(`<div class="section">No carrier or universal links found.</div>`);
        }

        output.innerHTML = blocks.join('');
        output.style.display = 'block';

        // Attach copy event listeners
        output.querySelectorAll('[data-copy]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const text = btn.getAttribute('data-copy');
            const ok = await copyText(text);
            showToast(ok ? 'Copied!' : 'Copy failed', !ok);
          });
        });

      } catch (err) {
        status.textContent = err.message || 'Failed to fetch';
        status.className = 'status error';
        console.error('Error:', err);
      }
    });
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
