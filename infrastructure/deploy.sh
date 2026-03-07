#!/bin/bash
#
# Vox Deployment Script
# One-command deployment to Google Cloud Run
# For Gemini Live Agent Challenge 2026
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🎤 VOX - Real-Time Multilingual Voice Agent             ║"
echo "║   Deployment Script for Google Cloud Run                  ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check required environment variables
check_env() {
    if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
        echo -e "${RED}Error: GOOGLE_CLOUD_PROJECT environment variable is not set${NC}"
        echo "Please set it with: export GOOGLE_CLOUD_PROJECT=your-project-id"
        exit 1
    fi
    
    if [ -z "$GOOGLE_API_KEY" ]; then
        echo -e "${YELLOW}Warning: GOOGLE_API_KEY not set. Make sure it's configured in Cloud Run.${NC}"
    fi
}

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT}
REGION=${GOOGLE_CLOUD_REGION:-us-central1}
SERVICE_NAME=${VOX_SERVICE_NAME:-vox-backend}
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Redis configuration (optional - for production)
REDIS_URL=${REDIS_URL:-""}

# GCS bucket for voice profiles
GCS_BUCKET_NAME=${GCS_BUCKET_NAME:-"$PROJECT_ID-vox-profiles"}

echo -e "${YELLOW}Configuration:${NC}"
echo "  Project ID:    $PROJECT_ID"
echo "  Region:        $REGION"
echo "  Service Name:  $SERVICE_NAME"
echo "  Image:         $IMAGE"
echo "  GCS Bucket:    $GCS_BUCKET_NAME"
echo ""

# Check environment
check_env

# Step 1: Enable required APIs
echo -e "${BLUE}Step 1: Enabling required Google Cloud APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    speech.googleapis.com \
    texttospeech.googleapis.com \
    storage.googleapis.com \
    redis.googleapis.com \
    --project=$PROJECT_ID

echo -e "${GREEN}✓ APIs enabled${NC}"

# Step 2: Create GCS bucket for voice profiles (if not exists)
echo -e "${BLUE}Step 2: Creating GCS bucket for voice profiles...${NC}"
if gsutil ls -b gs://$GCS_BUCKET_NAME 2>/dev/null; then
    echo -e "${GREEN}✓ Bucket already exists${NC}"
else
    gsutil mb -p $PROJECT_ID -l $REGION gs://$GCS_BUCKET_NAME
    echo -e "${GREEN}✓ Bucket created${NC}"
fi

# Step 3: Build and push Docker image
echo -e "${BLUE}Step 3: Building and pushing Docker image...${NC}"
cd "$(dirname "$0")/../backend"

gcloud builds submit \
    --tag $IMAGE \
    --project=$PROJECT_ID \
    --timeout=20m

echo -e "${GREEN}✓ Image built and pushed${NC}"

# Step 4: Deploy to Cloud Run
echo -e "${BLUE}Step 4: Deploying to Cloud Run...${NC}"

# Build environment variables string
ENV_VARS="GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
ENV_VARS="$ENV_VARS,GCS_BUCKET_NAME=$GCS_BUCKET_NAME"

if [ -n "$GOOGLE_API_KEY" ]; then
    ENV_VARS="$ENV_VARS,GOOGLE_API_KEY=$GOOGLE_API_KEY"
fi

if [ -n "$REDIS_URL" ]; then
    ENV_VARS="$ENV_VARS,REDIS_URL=$REDIS_URL"
fi

gcloud run deploy $SERVICE_NAME \
    --image $IMAGE \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --concurrency 80 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "$ENV_VARS" \
    --project=$PROJECT_ID

echo -e "${GREEN}✓ Deployed to Cloud Run${NC}"

# Step 5: Get service URL
echo -e "${BLUE}Step 5: Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --project=$PROJECT_ID \
    --format="value(status.url)")

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║   🎉 DEPLOYMENT SUCCESSFUL!                               ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Backend URL:${NC} $SERVICE_URL"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Update frontend/.env with:"
echo "     VITE_BACKEND_URL=$SERVICE_URL"
echo ""
echo "  2. Deploy frontend to Vercel:"
echo "     cd frontend && vercel --prod"
echo ""
echo "  3. Test the deployment:"
echo "     curl $SERVICE_URL/health"
echo ""

