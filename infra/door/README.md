# Deurscanner (Raspberry Pi)

`door.py` draait op de Raspberry Pi aan de deur. Het leest KU Leuven-studentenkaarten
via de kaartlezer (die als toetsenbord `serial;cardAppId` + Enter "typt") en opent de
GPIO-lock wanneer de website de scan goedkeurt. Daarnaast luistert het op een HTTP-poort
zodat de main-server de deur **remote** kan openen (dashboardknop) over Tailscale.

Zie ook: de website-kant in `apps/web/app/api/door/*`, `apps/web/lib/door-*.ts` en de
config onder **Admin -> IT -> Door scanner**. De rechten (`door.open`, `door.remoteOpen`,
`door.manage`) beheer je in `/admin/roles` en `/admin/deur`.

## Hoe het werkt

- **Kaartscan** (stdin): de Pi POST't de ruwe scan naar `POST {API_BASE}/api/door/scan`
  met het gedeelde secret als Bearer. De website verifieert de kaart bij KU Leuven, zoekt
  de gebruiker op via het r-nummer, beslist allow/deny op basis van `door.open` of een
  lopende tijdelijke toegang, en logt elke scan. De Pi opent de lock bij `allowed`.
- **Offline**: valt de site/internet weg, dan beslist de Pi op een lokale cache
  (`door_cache.json`, TTL `DOOR_CACHE_TTL`) van eerder geziene kaarten en buffert de
  events in `door_queue.json`. Zodra de site terug bereikbaar is, worden die naar
  `POST {API_BASE}/api/door/logs` geflusht.
- **Remote-open**: de server roept `POST http://<pi>:<poort>/open` aan (Bearer-secret).
  De Pi opent meteen. `GET /health` (ook Bearer) is er voor de "Test connection"-knop.

Beide richtingen gebruiken hetzelfde secret: `DOOR_DEVICE_SECRET` op de Pi == het secret
onder Admin -> IT.

## Vereisten

```bash
sudo apt update && sudo apt install -y python3 python3-pip
pip3 install requests RPi.GPIO
```

De kaartlezer is een toetsenbord-emulator; koppel z'n stdin aan het script (zie de
systemd-unit hieronder, die de lezer via het inputdevice naar stdin pipe't, of draai het
script in de sessie waar de lezer "typt").

## Configuratie (omgevingsvariabelen)

| Variabele | Default | Betekenis |
|-----------|---------|-----------|
| `API_BASE` | `https://vtk.be` | Basis-URL van de website. |
| `DOOR_DEVICE_SECRET` | *(leeg)* | Gedeeld Bearer-secret. **Verplicht.** Zelfde als Admin -> IT. |
| `DOOR_LISTEN_HOST` | `0.0.0.0` | Bind-adres van de remote-open listener (mag de Tailscale-IP zijn). |
| `DOOR_LISTEN_PORT` | `8080` | Poort van de listener. |
| `DOOR_GPIO_PORT` | `7` | BOARD-pin van de lock. |
| `DOOR_UNLOCK_SECONDS` | `5` | Hoelang de lock open blijft (de server kan dit per open overschrijven). |
| `DOOR_REQUEST_TIMEOUT` | `5` | Timeout (s) voor calls naar de site. |
| `DOOR_CACHE_TTL` | `3600` | Geldigheid (s) van de offline-cache. |
| `DOOR_FLUSH_INTERVAL` | `60` | Interval (s) waarop de queue geflusht wordt. |
| `DOOR_CACHE_FILE` / `DOOR_QUEUE_FILE` / `DOOR_LOG_FILE` | `./door_*` | Bestandslocaties. |
| `DOOR_DEBUG` | *(uit)* | Op `1`: draai zonder GPIO (enkel loggen). Handig om te testen. |

## Tailscale

Zorg dat de Pi en de main-server op hetzelfde tailnet zitten. Zet in Admin -> IT als
**Pi address** de Tailscale-URL van de Pi, bv. `http://door-pi:8080` (MagicDNS) of
`http://100.x.y.z:8080`. Beperk indien gewenst met tailnet-ACL's dat enkel de server de
listener-poort mag bereiken.

## systemd-unit

`/etc/systemd/system/vtk-door.service`:

```ini
[Unit]
Description=VTK deurscanner
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
# De kaartlezer is /dev/input/... (een keyboard). Pas het pad aan, of vervang de
# ExecStart door je eigen manier om de scans naar stdin te sturen.
ExecStart=/bin/sh -c '/usr/bin/python3 /opt/vtk-door/door.py'
WorkingDirectory=/opt/vtk-door
Environment=API_BASE=https://vtk.be
Environment=DOOR_DEVICE_SECRET=CHANGE_ME
Environment=DOOR_LISTEN_PORT=8080
Environment=DOOR_UNLOCK_SECONDS=5
Restart=always
RestartSec=3
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /opt/vtk-door && sudo cp door.py /opt/vtk-door/
sudo systemctl daemon-reload
sudo systemctl enable --now vtk-door
journalctl -u vtk-door -f
```

> De lock draait op GPIO, dus de service heeft toegang tot `/dev/gpiomem` nodig (user in
> de `gpio`-groep). De kaartlezer koppel je aan stdin op de manier die bij jullie opstelling
> past (bv. via `evtest`/`ykush`-achtige tooling of een kleine wrapper die het inputdevice
> naar stdin schrijft).

## Testen zonder hardware

```bash
DOOR_DEBUG=1 DOOR_DEVICE_SECRET=test API_BASE=http://localhost:3000 python3 door.py
# typ een scan + Enter:  1234;5678
# remote-open testen (andere terminal):
curl -X POST http://localhost:8080/open -H "Authorization: Bearer test" -d '{"unlockSeconds":3}'
curl http://localhost:8080/health -H "Authorization: Bearer test"
```
