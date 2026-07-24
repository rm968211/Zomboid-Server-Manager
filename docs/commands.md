# Command Reference

All commands are available via `make`.

## Services

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make build` | Build Docker images |
| `make restart` | Restart all services |
| `make stop` | Stop without removing containers |
| `make logs` | Follow service logs |
| `make ps` | List running containers |
| `make pull` | Pull latest images |

## Database

| Command | Description |
|---------|-------------|
| `make db-check` | Check/create DB volume |
| `make db-init` | Create empty DB volume |
| `make db-reset` | Reset DB volume (**danger**) |
| `make db-backup` | Backup database to `db-backups/` |
| `make db-restore` | Restore latest backup |

## App

| Command | Description |
|---------|-------------|
| `make migrate` | Run database migrations |
| `make test` | Run the test suite |
| `make exec CMD="..."` | Run command in app container |

### Common exec examples

```bash
# Code formatting
make exec CMD="vendor/bin/pint --dirty --format agent"

# Generate routes
make exec CMD="php artisan wayfinder:generate"

# Frontend build
make exec CMD="npm run build"

# Clear cache
make exec CMD="php artisan config:clear"
```

## Other

| Command | Description |
|---------|-------------|
| `make info` | Show URLs and public IP |
| `make arch` | Show detected CPU architecture |
| `make update-version` | Update `game-version.conf` after a PZ game update |
| `make nuke` | Destroy ALL data and stop services (**danger**) |
| `make help` | Show all available commands |
