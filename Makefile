.PHONY: frontend-run backend-run build-frontend build-backend build-all run-all podman-frontend-build podman-backend-build podman-build-all podman-push-all helm-deploy

build-all: build-frontend build-backend

run-all:
	$(MAKE) backend-run &
	$(MAKE) frontend-run

frontend-run:
	cd frontend && npx next dev -H 0.0.0.0 -p 3000

backend-run:
	cd backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

build-frontend:
	cd frontend && npm ci --no-audit --no-fund && npm run build

build-backend:
	cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt

podman-build-all: podman-backend-build podman-frontend-build

podman-backend-build:
	podman build $(PODMAN_ARGS) -f backend/Containerfile -t quay.io/eformat/prisoners-dilemma-backend:latest backend

podman-frontend-build:
	podman build $(PODMAN_ARGS) -f frontend/Containerfile -t quay.io/eformat/prisoners-dilemma-frontend:latest frontend

podman-push-all:
	podman push quay.io/eformat/prisoners-dilemma-backend:latest
	podman push quay.io/eformat/prisoners-dilemma-frontend:latest

helm-deploy:
	helm upgrade --install prisoners-dilemma ./deploy/chart $(HELM_ARGS)
