# Putting the GST Sales Portal online (Google Cloud, free)

This uses Google Cloud's **Always Free e2-micro** server. It costs nothing as long as you follow the choices below exactly. Choosing a different machine, region or disk type is charged. Plan for about 45 minutes. Most of that is waiting.

You'll need a Google account and a debit or credit card. The card is for verification; the free server isn't charged.

---

## 1. Create the Google Cloud account

1. Go to <https://console.cloud.google.com> and sign in with your Google account.
2. Accept the terms. Click **Activate** / **Start free** at the top and add your card details. New accounts also get some trial credit; the e2-micro server stays free after it runs out.
3. At the top of the page, click the project dropdown → **New project**, name it `gst-portal`, then **Create**. Make sure this project is selected.

### Protect yourself from surprise charges (2 minutes)
4. Search the top bar for **Budgets & alerts** → **Create budget**.
5. Name it `alert`, amount **₹100**, keep the default alerts (50%, 90%, 100%), then **Finish**. If anything ever starts costing money, you'll get an email.

## 2. Create the free server

1. Search the top bar for **Compute Engine** → **VM instances**. If asked, click **Enable** (it takes a minute).
2. Click **Create instance** and set exactly:

| Setting | Choose |
|---|---|
| Name | `gst-portal` |
| Region | **us-central1 (Iowa)**, or us-west1 (Oregon) / us-east1 (South Carolina). Only these three are free. |
| Zone | any |
| Machine configuration | Series **E2**, Machine type **e2-micro** |
| Boot disk → **Change** | OS **Ubuntu**, Version **Ubuntu 24.04 LTS (x86/64)**, Boot disk type **Standard persistent disk**, Size **30 GB** → **Select** |
| Firewall (under Networking) | ✅ **Allow HTTP traffic**  ✅ **Allow HTTPS traffic** |

3. Click **Create**. When the server appears in the list, copy its **External IP** (e.g. `34.123.45.67`).

> ⚠️ Don't pick "Balanced" or "SSD" disk, a bigger machine, or an Indian region (Mumbai/Delhi). Those are charged.

## 3. Get a free web address (DuckDNS)

The login needs HTTPS, and HTTPS needs a name, not just an IP.

1. Go to <https://www.duckdns.org> and sign in with Google.
2. Under **domains**, type a name (e.g. `mygstportal`) → **add domain**.
3. In the **current ip** box next to it, paste the server's External IP → **update ip**.
4. Copy the **token** shown at the top of the page.

Your address is now `mygstportal.duckdns.org`.

## 4. Install the app (one command)

1. Back in Google Cloud **VM instances**, click **SSH** next to your server. A black terminal window opens in the browser. Click **Authorize** if asked.
2. Paste these two lines (right-click → paste), then press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/Tilak004/crm_tool/main/deploy/setup.sh -o setup.sh
sudo bash setup.sh
```

3. Answer the three questions:
   - **Website address**: `mygstportal.duckdns.org`
   - **DuckDNS token**: paste the token
   - **CA admin password**: choose a strong one (nothing shows while you type; that's normal)

4. Wait. It installs everything, loads the official HSN list and builds the app, which takes 10–15 minutes on this small server. It ends with **Done!**

5. Open `https://mygstportal.duckdns.org` and log in as **admin** with the password you chose. The first visit can take a minute while the HTTPS certificate is issued.

Then create your staff accounts (**Staff**) and merchants (**Merchants**) as usual.

---

## Everyday tasks

All of these are typed in the **SSH** window.

| Task | Command |
|---|---|
| Install the latest code from GitHub | `sudo bash /opt/gst-portal/deploy/update.sh` |
| Is the app running? | `sudo systemctl status gst-portal` |
| Restart the app | `sudo systemctl restart gst-portal` |
| See recent errors | `sudo journalctl -u gst-portal -n 100` |
| Make a backup now | `sudo gst-portal-backup` |
| List backups | `ls -lh /var/backups/gst-portal` |

**Backups:** the database and uploaded invoice files are backed up every night at 3:00 am IST, and the last 14 days are kept on the server. Once a month, also keep a copy **off** the server: in the SSH window click the ⚙️ gear → **Download file** and enter e.g. `/var/backups/gst-portal/app-2026-11-30.db`. Do the same with the matching `uploads-….tar.gz`. A copy that's only on the server is lost if the server is.

## If something goes wrong

- **Site doesn't open or shows a certificate error.** Check on duckdns.org that the IP matches the server's External IP; the server also updates it automatically every 5 minutes. Check the firewall boxes in step 2 were ticked: open the server → **Edit** → Networking. Then run `sudo systemctl restart caddy`.
- **"502 Bad Gateway".** The app isn't running. Run `sudo journalctl -u gst-portal -n 100` and look at the last lines.
- **The HSN list is empty.** Log in as admin → **HSN codes** → **Load from GST portal**.

## Moving later (Railway, a paid server, your own domain)

- **Own domain:** at your domain provider, add an **A record** pointing to the server's IP. Then in SSH run `sudo nano /etc/caddy/Caddyfile`, replace the DuckDNS name with your domain, save (Ctrl+O, Enter, Ctrl+X), and run `sudo systemctl reload caddy`.
- **Another server:** run the same setup there, then copy over two things: the database `/var/lib/gst-portal/app.db` and the folder `/var/lib/gst-portal/uploads`. Also copy `/etc/gst-portal.env`, so logins and sessions keep working.

## Where things live on the server

| What | Where |
|---|---|
| App code | `/opt/gst-portal` |
| Database | `/var/lib/gst-portal/app.db` |
| Invoice uploads | `/var/lib/gst-portal/uploads` |
| Settings and secret key | `/etc/gst-portal.env` (keep private) |
| Backups | `/var/backups/gst-portal` |
