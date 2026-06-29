#!/usr/bin/env bash
# One-time GCS setup for Asterion chapter storage.
#
# Prereqs: gcloud CLI installed + authenticated (`gcloud init`), a project with
# the $500 credit linked as its billing account.
#
# Usage:
#   PROJECT=my-project BUCKET=asterion-novels-my-project ./gcs/setup.sh
set -euo pipefail

: "${PROJECT:?set PROJECT=your-gcp-project-id}"
: "${BUCKET:?set BUCKET=a-globally-unique-bucket-name}"
LOCATION="${LOCATION:-US}"
SA_NAME="${SA_NAME:-asterion-scraper}"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT"

echo "==> Creating bucket gs://$BUCKET ($LOCATION)"
gcloud storage buckets create "gs://$BUCKET" \
  --location="$LOCATION" --uniform-bucket-level-access || true

echo "==> Making objects publicly readable (chapter text is public content)"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member=allUsers --role=roles/storage.objectViewer

echo "==> Applying CORS (so the reader can fetch from the webview)"
gcloud storage buckets update "gs://$BUCKET" --cors-file="$(dirname "$0")/cors.json"

echo "==> Service account for the scraper VM (write access)"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Asterion scraper" || true
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" \
  --role=roles/storage.objectAdmin

cat <<EOF

✓ Done.
  Bucket:           gs://$BUCKET
  Public base URL:  https://storage.googleapis.com/$BUCKET/<content_path>
  Scraper SA:       $SA_EMAIL

Next:
  • Client  .env:                  VITE_GCS_BUCKET=$BUCKET
  • VM env:                        GCS_BUCKET=$BUCKET
  • Attach the SA when you create the VM (see scraper-service/README.md)
EOF
