# Linux Installation

## Requirements

You need a Linux server (Ubuntu, Debian, Fedora, etc.) with at least **4 GB RAM** (8 GB recommended). Works on both **x86_64** (AMD/Intel) and **ARM64** (Oracle Cloud free tier, Raspberry Pi 5, AWS Graviton, etc.) — architecture is auto-detected.

Install these before you begin:

| # | Dependency | Notes |
|---|-----------|-------|
| 1 | **Git** | Pre-installed on most distros. [Install](https://git-scm.com/downloads/linux) |
| 2 | **Docker Engine** | NOT Docker Desktop. [Install](https://docs.docker.com/engine/install/) |
| 3 | **Docker Compose v2** | Bundled with Docker Engine via official install script |
| 4 | **Make** | Usually pre-installed |
| 5 | **OpenSSL** | Pre-installed on virtually all Linux distros |
| 6 | **curl** | Pre-installed on most distros |

### Quick Docker install (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in after this
```

### Verify Docker Compose

```bash
docker compose version
```

### Install Make (if missing)

```bash
# Ubuntu/Debian
sudo apt install make

# Fedora/RHEL
sudo dnf install make
```

## Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_ORG/zomboid-manager.git
cd zomboid-manager
```

## Step 2 — Configure and start

```bash
cp .env.example .env    # fill in passwords/secrets
make up
```

This creates the database volume, builds the images, starts all containers, and provisions the admin account from the `ADMIN_*` variables in `.env`.

Make sure UDP ports 16261-16262 are reachable by players (host firewall and/or router port forwarding).

## Step 3 — Access the admin panel

```
http://localhost:8000
```

Log in with the admin credentials from `.env`. For remote access, put the panel behind your own reverse proxy.

## Step 4 — Connect in-game

In Project Zomboid:
1. Click **Join** from the main menu
2. Enter your server's public IP and port `16261`
3. Enter the server password (if you set one)

To find your server's public IP:
```bash
make info
```
