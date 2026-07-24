# Troubleshooting

## "Permission denied" on Docker commands

Make sure your user is in the docker group:
```bash
sudo usermod -aG docker $USER
```
Then **log out and back in**.

## Containers keep restarting

```bash
make logs
```

The game server takes a few minutes to download via SteamCMD on first launch. Be patient.

## Can't connect in-game

1. Check your public IP: `make info`
2. Make sure UDP ports 16261-16262 are open in your host firewall / router
3. Check cloud firewall rules (see [Cloud Provider Notes](#cloud-provider-notes))
4. Verify the server is running: `make ps`

## Admin panel not loading

1. Check local access: http://localhost:8000
2. For remote access, check your reverse proxy configuration
3. Check logs: `make logs`

## Want to start fresh

```bash
make nuke    # WARNING: deletes everything
make up
```

## Cloud Provider Notes

If running on a cloud VM (Oracle Cloud, AWS, GCP, etc.), you also need to open these ports in your cloud provider's **security group / firewall rules**:

| Port | Protocol | Purpose |
|------|----------|---------|
| 16261 | UDP | Game traffic |
| 16262 | UDP | Direct connection |

Cloud firewalls are separate from the OS-level firewall — open the ports in both.

## Minimum Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB free | 30 GB+ |
| OS | Ubuntu 22.04+, Debian 12+, Fedora 38+ | Any modern Linux with Docker |

The PZ game server alone needs 2-4 GB of RAM.
