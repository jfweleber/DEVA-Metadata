# Deploying to metadata.weleber.net

The site is static: HTML, CSS and ES modules with no build step and no server
side. Any host that serves files over HTTPS will run it. Serve the repository
root as the web root.

Two requirements only:

1. **Serve `.js` with a JavaScript MIME type.** The app uses native ES modules,
   and browsers refuse a module served as `text/plain`.
2. **HTTPS.** Copy to clipboard uses the async clipboard API, which browsers
   restrict to secure origins. There is a fallback, but HTTPS keeps it clean.

No environment variables, no secrets, no database, no build artifacts.

## Where the domain points today

As of this writing, `metadata.weleber.net` resolves to `172.236.224.173`, the
same address as `weleber.net`, which is served by nginx 1.24.0 on Ubuntu. DNS is
already correct for hosting the site on that server, so **Option A is the short
path**: no DNS change, no propagation wait, and nothing new to sign up for.

The remaining piece is a TLS certificate covering the `metadata` subdomain. The
current certificate on that host does not include it.

## Option A: the nginx server the domain already points at (recommended)

The repository is public, so the server can clone it directly with no
credentials.

```bash
sudo git clone https://github.com/jfweleber/DEVA-Metadata.git /var/www/deva-metadata
sudo chown -R www-data:www-data /var/www/deva-metadata
```

Add a server block, for example `/etc/nginx/sites-available/metadata.weleber.net`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name metadata.weleber.net;

    root /var/www/deva-metadata;
    index index.html;

    # ES modules must be served as JavaScript, not text/plain.
    types { text/javascript js mjs; }

    location / {
        try_files $uri $uri/ =404;
    }

    # The app is redeployed as a unit, so browsers must not hold stale modules.
    location ~* \.(js|css)$ {
        add_header Cache-Control "no-cache";
    }

    # Nothing here needs to be framed by another site.
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "same-origin";
}
```

Enable it, get a certificate, and reload. Certbot rewrites the block to listen
on 443 and adds the HTTP redirect:

```bash
sudo ln -s /etc/nginx/sites-available/metadata.weleber.net /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d metadata.weleber.net
```

Updating later is a pull:

```bash
sudo git -C /var/www/deva-metadata pull
```

There is no build step, so a pull is the whole deployment. If you want it
automatic, a cron entry or a GitHub webhook calling a pull script is enough;
nothing needs to be compiled or restarted.

## Option B: GitHub Pages (workflow included, requires a DNS change)

`.github/workflows/deploy.yml` publishes the repository root to GitHub Pages on
every push to `main`, and the `CNAME` file claims `metadata.weleber.net`. Both
sit inert until Pages is switched on, so they do no harm if you stay on Option A.

Use this only if you would rather not maintain the nginx host. It means moving
the subdomain away from your server:

1. **Settings > Pages > Build and deployment**, set the source to
   **GitHub Actions**.
2. Repoint DNS from `172.236.224.173` to GitHub:

   ```
   metadata.weleber.net.   CNAME   jfweleber.github.io.
   ```

3. **Settings > Pages**, enter `metadata.weleber.net` as the custom domain and
   tick **Enforce HTTPS** once the certificate is issued.

The repository is public, so Pages is free here. It would need a paid plan if
the repository were ever made private.

## Option C: Cloudflare Pages or Netlify (also a DNS change)

Both build nothing and publish the repository root. `netlify.toml` is included
and needs no edits.

- **Cloudflare Pages:** Workers and Pages > Create > Pages > Connect to Git,
  build command empty, output directory `/`, then add the custom domain.
- **Netlify:** Add new site > Import an existing project, build command empty,
  publish directory `.`, then add the domain and point DNS at the Netlify site.

Same trade as Option B: you gain a managed host and give up the subdomain
pointing at your own server.

## Verifying a deployment

1. Open the site. The Upload step should render with the step list on the left.
2. Click **Load the example export**. It should report 8 fields found, 3 user
   fields, and 3 fields needing a definition. If it says the example could not
   be loaded, the `samples/` directory is not being served.
3. Open **Review and download** and switch to **Snippet preview**. A green
   heading and a bordered attributes table should render.
4. Click **Download FGDC XML** and confirm the file downloads.

If step 2 fails but the page loads, the host is not serving the whole repository
root. If nothing renders at all, check the browser console for a MIME type error
on `src/app/main.js`, which means `.js` is being served as the wrong type.

## Notes for whoever maintains this

- There is no backend, so there is nothing to patch on a schedule and no data at
  rest. A stale deployment is the only real failure mode.
- `CLAUDE.md` in the repository root is the DEVA publishing standard the tool
  implements. When the standard changes, update it, update the affected module
  in `src/lib`, and run `npm test`. Several tests read `CLAUDE.md` directly, so
  a change to the NPS disclaimer text will fail the suite until the code agrees
  with the standard again.
