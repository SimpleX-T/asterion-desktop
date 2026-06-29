#!/usr/bin/env bash
# Create the GCP Compute Engine VM that runs the scraper.
# Run LOCALLY (needs gcloud). The VM gets the asterion-scraper service account so
# it can write to GCS with auto-refreshing tokens (no static token to expire).
set -euo pipefail

PROJECT="${PROJECT:-asterion-500817}"
ZONE="${ZONE:-us-central1-a}"
NAME="${NAME:-asterion-scraper}"
MACHINE="${MACHINE:-e2-medium}"   # 4GB RAM — comfortable for the Rust release build
SA="asterion-scraper@${PROJECT}.iam.gserviceaccount.com"

gcloud compute instances create "$NAME" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --machine-type="$MACHINE" \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --service-account="$SA" \
  --scopes=https://www.googleapis.com/auth/devstorage.read_write

cat <<EOF

✓ VM '$NAME' created in $ZONE.

Next (from this machine):
  1. Copy the scraper code up (clean target/ first — it's 1.5GB and scp has no exclude):
       cargo clean --manifest-path scraper-service/Cargo.toml
       gcloud compute scp --recurse ./scraper-service $NAME:~/scraper-service --zone=$ZONE
  2. Build + install the service on the VM:
       gcloud compute ssh $NAME --zone=$ZONE --command 'cd ~/scraper-service && bash deploy/bootstrap.sh'
  3. Add your secret key:
       gcloud compute ssh $NAME --zone=$ZONE --command 'sudo nano /etc/asterion/asterion.env'
     (set SUPABASE_SERVICE_KEY), then start the queue timer:
       gcloud compute ssh $NAME --zone=$ZONE --command 'sudo systemctl enable --now asterion-scraper.timer'

Backfill a big novel unattended (e.g. Shadow Slave):
  gcloud compute ssh $NAME --zone=$ZONE --command \\
    'set -a; . /etc/asterion/asterion.env; set +a; \\
     asterion-catalog-runner sync https://novelfire.net/book/shadow-slave'
EOF
