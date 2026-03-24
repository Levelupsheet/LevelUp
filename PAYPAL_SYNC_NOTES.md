# PayPal Sync

Manual sync:
- Admin Portal → DB Users → Sync PayPal

Weekly sync:
- Run `npm run sync:paypal`

Suggested cron (every Monday at 3am server time):
```cron
0 3 * * 1 cd /var/www/levelup && /usr/bin/npm run sync:paypal >> /var/log/levelup-paypal-sync.log 2>&1
```
