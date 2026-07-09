#!/usr/bin/env bash
#
# ONE-TIME platform setup, run ONCE by a Hypergro admin on the fresh GCP project.
# After this, teammates need only Node + the deploy key (NO gcloud on their machines).
#
# It provisions:
#   • the required APIs
#   • an Artifact Registry repo (for the app container images)
#   • two GCS buckets (deploy sources + app file uploads)
#   • a RUNTIME service account (what each app's container runs as)
#   • a DEPLOYER service account + key (the shared key you hand to teammates; it
#     both submits Cloud Builds AND is what those builds run as)
#   • the MONGO_BASE_URI secret
#   • all the IAM that ties it together
#
# Prereqs: gcloud installed, `gcloud auth login` as a project OWNER, and BILLING
# ENABLED on the project.
#
# Usage:  bash scripts/admin-setup.sh
set -euo pipefail

# ======= EDIT THIS ONCE =======
# PROJECT_ID="${PROJECT_ID:-REPLACE_WITH_GCP_PROJECT_ID}"
PROJECT_ID="hypergro-deployment-vibes"
# ==============================
REGION="${REGION:-asia-south1}"
AR_REPO="${AR_REPO:-apps}"
SOURCES_BUCKET="${SOURCES_BUCKET:-${PROJECT_ID}-deploy-sources}"
UPLOAD_BUCKET="${UPLOAD_BUCKET:-${PROJECT_ID}-uploads}"
RUNTIME_SA="${RUNTIME_SA:-app-runtime}"
DEPLOYER_SA="${DEPLOYER_SA:-deployer}"
KEY_OUT="${KEY_OUT:-./deploy-key.json}"

if [[ "$PROJECT_ID" == REPLACE_* ]]; then
  echo "✗ Edit PROJECT_ID at the top of this script first." >&2; exit 1
fi

RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "▸ Project: $PROJECT_ID   Region: $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▸ Enabling APIs…"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com storage.googleapis.com \
  logging.googleapis.com

echo "▸ Creating Artifact Registry repo '$AR_REPO'…"
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION" \
  --description="Vibecoded app images" 2>/dev/null || echo "  (already exists)"

echo "▸ Creating GCS buckets…"
gcloud storage buckets create "gs://$SOURCES_BUCKET" --location="$REGION" --uniform-bucket-level-access 2>/dev/null || echo "  (sources bucket already exists)"
gcloud storage buckets create "gs://$UPLOAD_BUCKET"  --location="$REGION" --uniform-bucket-level-access 2>/dev/null || echo "  (uploads bucket already exists)"

echo "▸ Creating service accounts…"
gcloud iam service-accounts create "$RUNTIME_SA"  --display-name="Vibe app runtime"  2>/dev/null || echo "  (runtime SA already exists)"
gcloud iam service-accounts create "$DEPLOYER_SA" --display-name="Vibe app deployer" 2>/dev/null || echo "  (deployer SA already exists)"

# Make sure the Cloud Build service agent exists (needed to run builds as a custom SA).
gcloud beta services identity create --service=cloudbuild.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
PROJ_NUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_AGENT="service-${PROJ_NUM}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

echo "▸ RUNTIME SA — read secrets + write the uploads bucket…"
gcloud storage buckets add-iam-policy-binding "gs://$UPLOAD_BUCKET" \
  --member="serviceAccount:$RUNTIME_SA_EMAIL" --role="roles/storage.objectAdmin" >/dev/null

echo "▸ DEPLOYER SA — project roles (submit builds, push images, deploy, read logs)…"
for ROLE in roles/cloudbuild.builds.editor roles/run.admin roles/artifactregistry.writer \
            roles/logging.logWriter roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA_EMAIL" --role="$ROLE" --condition=None >/dev/null
done

echo "▸ DEPLOYER SA — read/write the deploy-sources bucket…"
gcloud storage buckets add-iam-policy-binding "gs://$SOURCES_BUCKET" \
  --member="serviceAccount:$DEPLOYER_SA_EMAIL" --role="roles/storage.objectAdmin" >/dev/null

echo "▸ DEPLOYER SA — act as the runtime SA (to deploy apps that run as it)…"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --member="serviceAccount:$DEPLOYER_SA_EMAIL" --role="roles/iam.serviceAccountUser" >/dev/null

echo "▸ DEPLOYER SA — allow builds to run AS the deployer SA…"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA_EMAIL" \
  --member="serviceAccount:$DEPLOYER_SA_EMAIL" --role="roles/iam.serviceAccountUser" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA_EMAIL" \
  --member="serviceAccount:$CB_AGENT" --role="roles/iam.serviceAccountTokenCreator" >/dev/null 2>&1 || \
  echo "  (couldn't grant the Cloud Build agent tokenCreator yet — if the first deploy fails on permissions, re-run this script)"

echo "▸ MONGO_BASE_URI secret…"
if gcloud secrets describe MONGO_BASE_URI >/dev/null 2>&1; then
  echo "  (already exists — to update it: printf '%s' 'mongodb+srv://…' | gcloud secrets versions add MONGO_BASE_URI --data-file=-)"
else
  read -r -p "  Paste the MongoDB Atlas base URI (no db path, e.g. mongodb+srv://user:pass@cluster.mongodb.net): " MONGO_URI
  printf '%s' "$MONGO_URI" | gcloud secrets create MONGO_BASE_URI --data-file=-
fi
gcloud secrets add-iam-policy-binding MONGO_BASE_URI \
  --member="serviceAccount:$RUNTIME_SA_EMAIL" --role="roles/secretmanager.secretAccessor" >/dev/null

echo "▸ Generating the shared DEPLOYER key → $KEY_OUT …"
gcloud iam service-accounts keys create "$KEY_OUT" --iam-account="$DEPLOYER_SA_EMAIL"

cat <<EOF

✓ Platform setup complete.

Put these into deploy.config.json (only projectId + github.org are strictly required —
the rest auto-fill from projectId):
    gcp.projectId  = $PROJECT_ID
    gcp.region     = $REGION
    github.org     = <your GitHub org>

Then:
  1. Push the boilerplate to your org (see PLATFORM-SETUP.md).
  2. Send teammates the repo link + the key file: $KEY_OUT  (out of band — NEVER commit it).
     They run:  npm install → npm run setup → npm run bootstrap → npm run deploy
  3. If apps must be public, confirm your org policy allows public Cloud Run.
EOF
