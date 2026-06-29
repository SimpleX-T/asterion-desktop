# Deploying the scraper to a GCP VM

Runs the Rust scraper on Compute Engine so big backfills (e.g. Shadow Slave's
3,000+ chapters) run unattended with auto-refreshing GCS tokens — unlike the
local smoke test, whose `gcloud` token expires after ~1 hour.

## One-time

```bash
# from the asterion-desktop/ project root, with gcloud authed to asterion-500817

# 1. Create the VM (e2-medium, asterion-scraper SA attached, storage write scope)
PROJECT=asterion-500817 ZONE=us-central1-a ./scraper-service/deploy/create-vm.sh

# 2. Copy the code up.
#    IMPORTANT: clean the local build dir first — target/ is ~1.5GB of tiny files
#    and gcloud scp has no exclude flag, so copying it takes hours. The VM builds
#    its own binary anyway.
cargo clean --manifest-path scraper-service/Cargo.toml
gcloud compute scp --recurse ./scraper-service asterion-scraper:~/scraper-service --zone=us-central1-a

# 3. Build + install service/timer on the VM
gcloud compute ssh asterion-scraper --zone=us-central1-a \
  --command 'cd ~/scraper-service && bash deploy/bootstrap.sh'

# 4. Set the secret key, then enable the 5-min queue drain
gcloud compute ssh asterion-scraper --zone=us-central1-a \
  --command 'sudo nano /etc/asterion/asterion.env'      # set SUPABASE_SERVICE_KEY
gcloud compute ssh asterion-scraper --zone=us-central1-a \
  --command 'sudo systemctl enable --now asterion-scraper.timer'
```

## What runs
- **`asterion-scraper.timer`** fires `asterion-scraper.service` every 5 min, which
  runs `catalog-runner queue` — scraping any novels users requested in the app.
- **Manual backfill** of a specific novel (full, resumable):
  ```bash
  gcloud compute ssh asterion-scraper --zone=us-central1-a --command \
    'set -a; . /etc/asterion/asterion.env; set +a; \
     asterion-catalog-runner sync https://novelfire.net/book/shadow-slave'
  ```
- **Whole-catalog backfill** (needs the catalog file on the VM):
  ```bash
  gcloud compute scp ./supabase/seed/novelfire-catalog.json asterion-scraper:~/ --zone=us-central1-a
  gcloud compute ssh asterion-scraper --zone=us-central1-a --command \
    'set -a; . /etc/asterion/asterion.env; set +a; \
     CATALOG_FILE=~/novelfire-catalog.json asterion-catalog-runner catalog 500 0'
  ```

## Monitor
```bash
gcloud compute ssh asterion-scraper --zone=us-central1-a --command 'journalctl -u asterion-scraper.service -n 100 --no-pager'
```

## Cost control
`e2-medium` ≈ $24/mo. **Stop the VM when idle** to save credit (the queue can wait):
```bash
gcloud compute instances stop asterion-scraper --zone=us-central1-a
gcloud compute instances start asterion-scraper --zone=us-central1-a
```
