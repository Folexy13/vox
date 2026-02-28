# Vox Infrastructure

Deployment scripts and configuration for Google Cloud Platform.

## Prerequisites

1. **Google Cloud SDK** installed and configured
2. **Google Cloud Project** with billing enabled
3. **Required APIs** (enabled automatically by deploy.sh):
   - Cloud Run API
   - Cloud Build API
   - Artifact Registry API
   - Speech-to-Text API
   - Text-to-Speech API
   - Cloud Storage API
   - Redis API (optional)

## Quick Deploy

```bash
# Set your project ID
export GOOGLE_CLOUD_PROJECT=your-project-id

# Set your Gemini API key
export GOOGLE_API_KEY=your-gemini-api-key

# Run deployment
chmod +x deploy.sh
./deploy.sh
```

## Files

| File | Purpose |
|------|---------|
| `deploy.sh` | One-command deployment script |
| `cloudbuild.yaml` | CI/CD configuration for Cloud Build |
| `cloudrun.yaml` | Cloud Run service definition |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | Your GCP project ID |
| `GOOGLE_API_KEY` | Yes | Gemini API key |
| `GOOGLE_CLOUD_REGION` | No | Deployment region (default: us-central1) |
| `GCS_BUCKET_NAME` | No | Voice profiles bucket (default: {project}-vox-profiles) |
| `REDIS_URL` | No | Redis connection URL for session management |

## CI/CD Setup

To enable automatic deployments on push:

1. Connect your repository to Cloud Build:
   ```bash
   gcloud builds triggers create github \
     --repo-name=vox \
     --repo-owner=your-username \
     --branch-pattern="^main$" \
     --build-config=infrastructure/cloudbuild.yaml
   ```

2. Set up secrets for API keys:
   ```bash
   echo -n "your-api-key" | gcloud secrets create google-api-key --data-file=-
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Platform                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Cloud Run   │    │   Cloud      │    │   Cloud      │  │
│  │  (Backend)   │◄──►│   Storage    │    │   Build      │  │
│  │              │    │  (Profiles)  │    │   (CI/CD)    │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Speech-to-  │    │  Text-to-    │    │   Gemini     │  │
│  │    Text      │    │   Speech     │    │   API        │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Hackathon Submission

For the Gemini Live Agent Challenge, make sure to:

1. **Record the GCP Console** showing:
   - Cloud Run service running
   - Active requests during demo
   - Logs showing real-time processing

2. **Include in submission**:
   - Link to deployed backend
   - Link to deployed frontend
   - Architecture diagram
   - This infrastructure code

3. **Bonus points**:
   - Infrastructure as Code (this directory)
   - Automated deployment script
   - CI/CD pipeline configuration

## Troubleshooting

### Build fails
```bash
# Check Cloud Build logs
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### Service not responding
```bash
# Check Cloud Run logs
gcloud run services logs read vox-backend --region=us-central1
```

### WebSocket connection issues
- Ensure Cloud Run timeout is set to 300s
- Check that `--allow-unauthenticated` is set
- Verify frontend is using correct backend URL

## Cost Estimation

For hackathon demo usage (minimal):
- Cloud Run: ~$0-5/month (scale to zero)
- Cloud Storage: ~$0.02/GB/month
- Speech-to-Text: ~$0.006/15 seconds
- Text-to-Speech: ~$4/1M characters
- Gemini API: Check current pricing

**Tip**: Use Cloud Run's scale-to-zero to minimize costs when not demoing.
