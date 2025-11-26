(function() {
  'use strict';

  const client = ZAFClient.init();
  // Supabase Edge Function endpoint for API
  const apiBaseUrl = 'https://lrjemtcgiiscpfzypftx.supabase.co/functions/v1/links';
  
  // Store all orders for the customer
  let customerOrders = [];

  // Get all orders by customer email from Shopify API
  async function getOrdersByEmail() {
    try {
      console.log('Getting orders by requester email...');
      
      // Get requester email from ticket
      const ticketData = await client.get(['ticket.requester']);
      const requester = ticketData['ticket.requester'];
      
      if (!requester || !requester.email) {
        console.log('No requester email found');
        return { orders: [], latestOrder: null };
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
        return { orders: [], latestOrder: null };
      }
      
      const data = await response.json();
      console.log('Orders by email response:', data);
      
      return {
        orders: data.orders || [],
        latestOrder: data.latestOrder || (data.orders && data.orders[0]) || null
      };
    } catch (error) {
      console.error('Error getting orders by email:', error);
      return { orders: [], latestOrder: null };
    }
  }

  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Create and show order selector dropdown
  function showOrderSelector(orders, orderNameInput) {
    // Remove existing selector if any
    const existingSelector = document.getElementById('orderSelector');
    if (existingSelector) {
      existingSelector.remove();
    }
    
    if (orders.length <= 1) return;
    
    // Create selector container
    const selectorContainer = document.createElement('div');
    selectorContainer.id = 'orderSelector';
    selectorContainer.className = 'order-selector';
    
    const label = document.createElement('div');
    label.className = 'selector-label';
    label.textContent = `${orders.length} orders found — select one:`;
    selectorContainer.appendChild(label);
    
    const select = document.createElement('select');
    select.className = 'order-select';
    select.id = 'orderSelectDropdown';
    
    orders.forEach((order, index) => {
      const option = document.createElement('option');
      option.value = order.orderName;
      const dateStr = formatDate(order.createdAt);
      option.textContent = `${order.orderName}${dateStr ? ' — ' + dateStr : ''}${index === 0 ? ' (latest)' : ''}`;
      select.appendChild(option);
    });
    
    select.addEventListener('change', () => {
      orderNameInput.value = select.value;
    });
    
    selectorContainer.appendChild(select);
    
    // Insert after the input field
    const inputRow = orderNameInput.closest('.row');
    if (inputRow && inputRow.parentNode) {
      inputRow.parentNode.insertBefore(selectorContainer, inputRow.nextSibling);
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

    // Try to get all orders for the customer
    async function loadOrders() {
      const result = await getOrdersByEmail();
      customerOrders = result.orders;
      
      if (result.latestOrder && result.latestOrder.orderName) {
        orderNameInput.value = result.latestOrder.orderName;
        
        // Show dropdown if multiple orders
        if (customerOrders.length > 1) {
          showOrderSelector(customerOrders, orderNameInput);
        }
        return true;
      }
      return false;
    }

    // Initial load
    let loaded = await loadOrders();
    
    if (!loaded) {
      // Retry up to 3 times with 2 second intervals
      let retryCount = 0;
      const maxRetries = 3;
      const retryInterval = 2000;
      
      const retryDetection = setInterval(async () => {
        retryCount++;
        loaded = await loadOrders();
        
        if (loaded || retryCount >= maxRetries) {
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
