# Cold Start & Connection Reset Fix

## Masla Kya Tha?

Jab bahot der baad (5+ minutes) website ko visit karte hain to ye errors aate hain:
- **Connection Reset** - Browser connection timeout ho jata hai
- **Too Many Redirects** - Page load nahi hota
- **Slow Response** - Pages 30+ seconds mein open hote hain

Ye masla **Cold Start** ki wajah se hota hai. Cloudflare Worker aur D1 Database inactive ho jate hain agar traffic nahi hoti.

## Solution Jo Implement Kiya Gaya

### 1. Database Initialization Improved
**File: `src/config/db.js`**
- DB timeout 5s se **10s** kar diya (line 22)
- Ab zyada time milta hai database ko initialize hone ke liye
- Heavy load ya slow network mein bhi kaam karega

### 2. Request Handler Optimization
**File: `src/index.js` (lines 1256-1286)**
- Ab critical paths (`/api/`, `/blog/`, `/product-`, `/admin/`) ke liye DB initialization ka wait karta hai
- Static files (CSS, JS, images) ke liye background mein warm up hota hai
- 8 second timeout protection hai taake request hang na ho

### 3. Cron Frequency Increased
**File: `wrangler.toml` (lines 47-52)**
- Cron job 5 minutes se **3 minutes** kar diya
- Har 3 minute mein worker aur database warm rehte hain
- Daily 2 AM cleanup bhi same hai

### 4. Health Check Endpoint Enhanced
**File: `src/index.js` (lines 1402-1428)**
- `/api/health` endpoint ab force DB initialization karta hai
- External monitoring services (UptimeRobot, etc.) use kar sakte hain
- Response mein DB status bhi show hota hai

### 5. Cron Job Warmup Improved
**File: `src/index.js` (lines 2115-2147)**
- Ab 3 parallel queries run hoti hain warming ke liye:
  - Simple health check query
  - Products count query
  - Orders count query
- Ye ensure karta hai ke poora database connection active ho

## Deployment Steps

1. **Changes deploy karein:**
```bash
npm run deploy
```

2. **Cron jobs verify karein:**
```bash
wrangler deployments list
```

3. **Health endpoint test karein:**
```bash
curl https://your-domain.com/api/health
```

## Additional Recommendations

### A. External Monitoring Setup (Highly Recommended)
Free monitoring services use karein jo har 1-2 minute mein website ko ping karti hain:

**Best Options:**
1. **UptimeRobot** (Free tier: 50 monitors)
   - URL: https://uptimerobot.com
   - Setup: Add monitor with URL `https://your-domain.com/api/health`
   - Interval: 3 minutes

2. **Pingdom** (Free: 1 monitor)
   - URL: https://pingdom.com
   - Similar setup as above

3. **Freshping** (Free: 50 monitors)
   - URL: https://freshping.io
   - Best for multiple endpoints

### B. Cloudflare Settings Check
1. **Browser Cache TTL**: 4 hours (optimal balance)
2. **Edge Cache TTL**: Default
3. **Development Mode**: OFF (production mein)

### C. Performance Monitoring
Dashboard mein ye metrics dekhen:
```
Cloudflare Dashboard > Workers & Pages > wishesu1 > Metrics
```
- CPU Time
- Requests per second
- Error rate
- P95/P99 latency

## Testing Checklist

- [ ] Wait 10+ minutes without visiting site
- [ ] Visit homepage - should load in <5 seconds
- [ ] Check `/api/health` - should return `{"status":"ok","db":"healthy"}`
- [ ] Test blog pages `/blog/any-post`
- [ ] Test product pages `/product-1/slug`
- [ ] Check browser console for errors
- [ ] Monitor for next 1 hour after deployment

## Expected Results

**Before Fix:**
- Cold start delay: 30-60 seconds
- Connection resets common
- Error rate: 10-20%

**After Fix:**
- Cold start delay: 3-8 seconds
- Connection resets rare
- Error rate: <2%

## Troubleshooting

### Agar abhi bhi slow hai:

1. **Check cron execution:**
```bash
wrangler tail --format pretty
```

2. **Check D1 database status:**
```bash
wrangler d1 execute secure-shop-db --command "SELECT 1"
```

3. **Increase cron frequency** (wrangler.toml):
```toml
crons = ["*/2 * * * *"]  # Every 2 minutes
```

4. **Enable request logging:**
Add to src/index.js:
```javascript
console.log('Request:', method, path, Date.now());
```

## Contact & Support

Issues report karein dashboard ya logs check karein:
```bash
wrangler tail --format json > logs.json
```

---
**Last Updated:** 2026-01-21
**Version:** 20+cold-fix
