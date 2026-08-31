# Deploying to metadata.weleber.net

The site is static: HTML, CSS and ES modules with no build step and no server
side. Any host that serves files over HTTPS will run it. Serve the repository
root as the web root.

Two requirements only:

1. **Serve `.js` with a JavaScript MIME type.** The app uses native ES modules,
   and browsers refuse a module served as `text/plain`. Every host below does
   this correctly out of the box.
2. **HTTPS.** Copy to clipboard uses the async clipboard API, which browsers
   restrict to secure origins. There is a fallback, but HTTPS keeps it clean.

No environment variables, no secrets, no database.

## Option A: GitHub Pages (workflow included)

`.github/workflows/deploy.yml` publishes the repository root to GitHub Pages on
every push to `main`, and the `CNAME` file claims `metadata.weleber.net`.

To turn it on:

1. In the repository, **Settings > Pages > Build and deployment**, set the source
   to **GitHub Actions**.
2. Point DNS at GitHub Pages. For the apex-style subdomain `metadata`, a CNAME
   record is the right shape:

   ```
   metadata.weleber.net.   CNAME   jfweleber.github.io.
   ```

3. Back in **Settings > Pages**, enter `metadata.weleber.net` as the custom
   domain and tick **Enforce HTTPS** once the certificate is issued.

If DNS already points somewhere else, use one of the options below instead and
leave the workflow disabled.

## Option B: Cloudflare Pages

1. **Workers and Pages > Create > Pages > Connect to Git**, pick this repository.
2. Build command: leave empty. Build output directory: `/`.
3. **Custom domains > Set up a custom domain**, enter `metadata.weleber.net`.
   Cloudflare writes the DNS record itself when the zone is on Cloudflare.

## Option C: Netlify

`netlify.toml` is included and needs no edits.

1. **Add new site > Import an existing project**, pick this repository.
2. Build command empty, publish directory `.`.
3. **Domain management > Add a domain**, enter `metadata.weleber.net`, then
   point DNS at the Netlify site with a CNAME.

## Option D: A server you run (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name metadata.weleber.net;

    ssl_certificate     /etc/letsencrypt/live/metadata.weleber.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/metadata.weleber.net/privkey.pem;

    root /var/www/deva-metadata;
    index index.html;

    # ES modules must be served as JavaScript.
    types { text/javascript js mjs; }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # The app is versioned by deploy, so do not let browsers hold stale modules.
    location ~* \.(js|css)$ {
        add_header Cache-Control "no-cache";
    }
}

server {
    listen 80;
    server_name metadata.weleber.net;
    return 301 https://$host$request_uri;
}
```

Deploy with a checkout and a pull:

```bash
git clone https://github.com/jfweleber/DEVA-Metadata.git /var/www/deva-metadata
# later
cd /var/www/deva-metadata && git pull
```

## Verifying a deployment

1. Open the site. The Upload step should render with the step list on the left.
2. Click **Load the example export**. It should report 8 fields found, 3 user
   fields, and 3 fields needing a definition. If it reports that the example
   could not be loaded, the `samples/` directory is not being served.
3. Open **Review and download** and switch to **Snippet preview**. A green
   heading and a bordered attributes table should render.
4. Click **Download FGDC XML** and confirm the file downloads.

If step 2 fails but the page loads, the host is not serving the whole repository
root. If nothing renders at all, check the browser console for a MIME type error
on `src/app/main.js`.

## Notes for whoever maintains this

- There is no backend, so there is nothing to patch on a schedule and no data
  at rest. A stale deployment is the only real failure mode.
- `CLAUDE.md` in the repository root is the DEVA publishing standard the tool
  implements. When the standard changes, update it, update the affected module
  in `src/lib`, and run `npm test`. Several tests read `CLAUDE.md` directly, so
  a change to the NPS disclaimer text will fail the suite until the code agrees
  with the standard again.
