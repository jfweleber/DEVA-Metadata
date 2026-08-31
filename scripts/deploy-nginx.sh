#!/usr/bin/env bash
# =============================================================================
# DEPLOY THE DEVA METADATA PUBLISHER TO AN NGINX HOST
# =============================================================================
# Run this on the server that metadata.weleber.net already points at:
#
#   sudo bash scripts/deploy-nginx.sh
#
# It works three ways:
#
#   1. From a checkout on the server: it pulls and reloads.
#   2. From nothing: it clones the repository first.
#   3. From files you unpacked into APP_DIR yourself, for example out of the
#      release tarball. It leaves them alone and only configures nginx.
#
# It is safe to run more than once. On the first run it clones the repository,
# writes an nginx server block and requests a certificate. On later runs it
# pulls the latest code and reloads nginx, leaving your configuration alone.
#
# It never touches any other site on the box: it writes exactly one file, named
# for this domain, and refuses to overwrite an existing one without saving a
# backup first.
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-metadata.weleber.net}"
APP_DIR="${APP_DIR:-/var/www/deva-metadata}"
REPO="${REPO:-https://github.com/jfweleber/DEVA-Metadata.git}"
BRANCH="${BRANCH:-main}"
SITE_FILE="/etc/nginx/sites-available/${DOMAIN}"
SITE_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

log() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this with sudo."
command -v nginx >/dev/null || fail "nginx is not installed on this host."

# -----------------------------------------------------------------------------
# STEP 1: GET THE CODE
# -----------------------------------------------------------------------------
if [ -d "${APP_DIR}/.git" ]; then
  log "Updating the existing checkout at ${APP_DIR}"
  command -v git >/dev/null || fail "git is not installed. Try: apt install git"
  git -C "${APP_DIR}" fetch --quiet origin "${BRANCH}"
  git -C "${APP_DIR}" reset --hard --quiet "origin/${BRANCH}"
  DEPLOYED_AT="$(git -C "${APP_DIR}" log -1 --format='%h %s')"
elif [ -f "${APP_DIR}/index.html" ]; then
  # Files were put here by hand, usually by unpacking the release tarball.
  # Leave them alone and just do the nginx half of the job.
  log "Using the files already in ${APP_DIR}, skipping the checkout"
  DEPLOYED_AT="files already in place"
elif [ -e "${APP_DIR}" ] && [ -n "$(ls -A "${APP_DIR}" 2>/dev/null)" ]; then
  fail "${APP_DIR} exists, is not a git checkout, and has no index.html. Move it aside first."
else
  command -v git >/dev/null || fail "git is not installed. Try: apt install git"
  log "Cloning ${REPO} into ${APP_DIR}"
  git clone --quiet --branch "${BRANCH}" "${REPO}" "${APP_DIR}"
  DEPLOYED_AT="$(git -C "${APP_DIR}" log -1 --format='%h %s')"
fi

# nginx only needs to read these files.
chown -R www-data:www-data "${APP_DIR}"
find "${APP_DIR}" -type d -exec chmod 755 {} +
find "${APP_DIR}" -type f -exec chmod 644 {} +

# -----------------------------------------------------------------------------
# STEP 2: NGINX SERVER BLOCK
# -----------------------------------------------------------------------------
# Written only when absent, so a certbot-managed block or your own edits are
# never clobbered by a later run.
if [ -f "${SITE_FILE}" ]; then
  log "Server block already exists at ${SITE_FILE}, leaving it as it is"
else
  log "Writing ${SITE_FILE}"
  cat > "${SITE_FILE}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${APP_DIR};
    index index.html;

    # Note on MIME types: do NOT add a types { } block here. Inside a server
    # block it REPLACES the inherited map from mime.types rather than adding to
    # it, which would leave CSS and images as application/octet-stream. The
    # bundled mime.types already serves .js correctly, which is all the app
    # needs for its ES modules.

    location / {
        try_files \$uri \$uri/ =404;
    }

    # The app deploys as a unit, so browsers must not hold stale modules.
    location ~* \.(js|css)\$ {
        add_header Cache-Control "no-cache";
    }

    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "same-origin";

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log  /var/log/nginx/${DOMAIN}.error.log;
}
NGINX
fi

[ -L "${SITE_LINK}" ] || ln -s "${SITE_FILE}" "${SITE_LINK}"

log "Testing the nginx configuration"
nginx -t || fail "nginx rejected the configuration. Nothing was reloaded."
systemctl reload nginx
log "nginx reloaded"

# -----------------------------------------------------------------------------
# STEP 3: TLS CERTIFICATE
# -----------------------------------------------------------------------------
# The site works over plain HTTP, but the copy-to-clipboard button needs a
# secure origin, so a certificate is not optional in practice.
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  log "Certificate already present for ${DOMAIN}"
elif command -v certbot >/dev/null; then
  if [ -d /etc/letsencrypt/accounts ] && [ -n "$(ls -A /etc/letsencrypt/accounts 2>/dev/null)" ]; then
    # This host already has a Let's Encrypt account, so certbot can reuse it
    # and its expiry contact without prompting.
    log "Requesting a certificate for ${DOMAIN}"
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect || \
      printf '\nCertbot did not complete. Run it yourself:\n  sudo certbot --nginx -d %s\n' "${DOMAIN}"
  else
    # No account yet. Registering without an email address means no expiry
    # warnings, so let certbot ask rather than deciding that silently.
    printf '\nNo Let'"'"'s Encrypt account found on this host. Run certbot yourself so it\n'
    printf 'can register an address for expiry notices:\n  sudo certbot --nginx -d %s\n' "${DOMAIN}"
  fi
else
  printf '\nCertbot is not installed, so the site is HTTP only for now.\n'
  printf 'Install it and rerun:\n  sudo apt install certbot python3-certbot-nginx\n  sudo certbot --nginx -d %s\n' "${DOMAIN}"
fi

# -----------------------------------------------------------------------------
# DONE
# -----------------------------------------------------------------------------
cat <<SUMMARY

=============================================================================
Deployed: ${DEPLOYED_AT}
Served from: ${APP_DIR}
URL: https://${DOMAIN}

Check it worked:
  1. Open the site. The upload step should render with the step list at left.
  2. Click "Load the example export". It should report 8 fields found and
     3 fields needing a definition. If it cannot load the example, the whole
     repository root is not being served.
  3. Open "Review and download" and switch to "Snippet preview".

To update later, run this script again, or just:
  sudo git -C ${APP_DIR} pull && sudo systemctl reload nginx
=============================================================================
SUMMARY
