<?php
/**
 * Plugin Name:       Turingate – Agent Lane
 * Plugin URI:        https://github.com/rudraneel93/turingate-sdk/tree/main/integrations/wordpress
 * Description:       Let verified AI agents use your site (requests, bookings, your REST API and WooCommerce) while human visitors see no change. Powered by Turingate, the reverse CAPTCHA.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Turingate
 * Author URI:        https://reverse-captcha.onrender.com
 * License:           MIT
 * Text Domain:       turingate
 */

if (!defined('ABSPATH')) {
    exit;
}

define('TURINGATE_VERSION', '0.1.0');
define('TURINGATE_DEFAULT_SERVER', 'https://reverse-captcha.onrender.com');

/* ------------------------------------------------------------------ settings */

function turingate_opt($key, $default = '') {
    $o = get_option('turingate_settings', array());
    return isset($o[$key]) && $o[$key] !== '' ? $o[$key] : $default;
}

function turingate_server() {
    $s = defined('TURINGATE_SERVER') ? TURINGATE_SERVER : turingate_opt('server', TURINGATE_DEFAULT_SERVER);
    return untrailingslashit(esc_url_raw($s));
}

function turingate_configured() {
    return turingate_opt('site_id') !== '' && turingate_opt('site_key') !== '';
}

add_action('admin_menu', function () {
    add_options_page('Turingate', 'Turingate', 'manage_options', 'turingate', 'turingate_settings_page');
});

add_action('admin_init', function () {
    register_setting('turingate', 'turingate_settings', array('sanitize_callback' => 'turingate_sanitize_settings'));
});

function turingate_sanitize_settings($in) {
    $old = get_option('turingate_settings', array());
    $out = array();
    $out['site_id'] = preg_match('/^s_[0-9a-f]{16}$/', trim((string) ($in['site_id'] ?? ''))) ? trim($in['site_id']) : '';
    // An empty key field keeps the saved key, so it is never printed back into the page.
    $key = trim((string) ($in['site_key'] ?? ''));
    $out['site_key'] = $key !== '' ? sanitize_text_field($key) : ($old['site_key'] ?? '');
    $server = esc_url_raw(trim((string) ($in['server'] ?? '')), array('https', 'http'));
    $out['server'] = $server ?: TURINGATE_DEFAULT_SERVER;
    $out['notify_email'] = sanitize_email($in['notify_email'] ?? '');
    $out['require_bound'] = empty($in['require_bound']) ? 0 : 1;
    $out['rest_lane'] = empty($in['rest_lane']) ? 0 : 1;
    $out['rest_require'] = empty($in['rest_require']) ? 0 : 1;
    $out['read_scope'] = sanitize_text_field($in['read_scope'] ?? 'api:read') ?: 'api:read';
    $out['write_scope'] = sanitize_text_field($in['write_scope'] ?? 'api:write') ?: 'api:write';
    $out['checkout_scope'] = sanitize_text_field($in['checkout_scope'] ?? 'shop:checkout') ?: 'shop:checkout';
    $out['desk_page'] = absint($in['desk_page'] ?? 0);
    return $out;
}

function turingate_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $o = wp_parse_args(get_option('turingate_settings', array()), array(
        'site_id' => '', 'site_key' => '', 'server' => TURINGATE_DEFAULT_SERVER, 'notify_email' => '', 'require_bound' => 0,
        'rest_lane' => 0, 'rest_require' => 0, 'read_scope' => 'api:read', 'write_scope' => 'api:write',
        'checkout_scope' => 'shop:checkout', 'desk_page' => 0,
    ));
    $check = isset($_GET['turingate_check']) ? turingate_check_connection() : null;
    ?>
    <div class="wrap">
      <h1>Turingate – Agent Lane</h1>
      <p>Let verified AI agents use your site on behalf of real people. Human visitors see no change.
         Get your Site ID and API key from the <a href="<?php echo esc_url(turingate_server() . '/console'); ?>" target="_blank" rel="noopener">Turingate Console</a>.</p>
      <?php if ($check !== null) : ?>
        <div class="notice <?php echo $check === true ? 'notice-success' : 'notice-error'; ?>"><p><?php echo $check === true ? 'Connected to Turingate ✓' : esc_html('Could not connect: ' . $check); ?></p></div>
      <?php endif; ?>
      <form method="post" action="options.php">
        <?php settings_fields('turingate'); ?>
        <h2>1. Your keys</h2>
        <table class="form-table" role="presentation">
          <tr><th><label for="tg-site">Site ID</label></th><td><input id="tg-site" name="turingate_settings[site_id]" class="regular-text code" value="<?php echo esc_attr($o['site_id']); ?>" placeholder="s_0123456789abcdef"></td></tr>
          <tr><th><label for="tg-key">API key</label></th><td><input id="tg-key" type="password" name="turingate_settings[site_key]" class="regular-text code" value="" autocomplete="off" placeholder="<?php echo $o['site_key'] ? 'Saved. Leave empty to keep it.' : 'rck_…'; ?>">
            <p class="description">Stored in your WordPress database and only sent to Turingate when checking a pass.</p></td></tr>
        </table>
        <h2>2. Agent desk</h2>
        <p>Add the shortcode <code>[turingate_agent_desk]</code> to any page, for example "For AI assistants". Agents send requests there for their users; you find them under <b>Agent requests</b>.</p>
        <table class="form-table" role="presentation">
          <tr><th><label for="tg-email">Email new requests to</label></th><td><input id="tg-email" type="email" name="turingate_settings[notify_email]" class="regular-text" value="<?php echo esc_attr($o['notify_email']); ?>" placeholder="<?php echo esc_attr(get_option('admin_email')); ?>"></td></tr>
          <tr><th>Who can submit</th><td><label><input type="checkbox" name="turingate_settings[require_bound]" value="1" <?php checked($o['require_bound'], 1); ?>> Only agents with a verified owner (recommended for orders and payments)</label></td></tr>
          <tr><th><label for="tg-page">Desk page</label></th><td><?php wp_dropdown_pages(array('name' => 'turingate_settings[desk_page]', 'id' => 'tg-page', 'selected' => (int) $o['desk_page'], 'show_option_none' => '— none —', 'option_none_value' => 0)); ?>
            <p class="description">Advertised to agents in a <code>Link</code> header and a meta tag, so they can find it.</p></td></tr>
        </table>
        <h2>3. Agent lane for your REST API and WooCommerce (optional)</h2>
        <table class="form-table" role="presentation">
          <tr><th>Verify agent passes</th><td><label><input type="checkbox" name="turingate_settings[rest_lane]" value="1" <?php checked($o['rest_lane'], 1); ?>> Check every REST request that carries <code>Authorization: AgentPass …</code> and reject invalid or over-limit ones</label></td></tr>
          <tr><th>Require a pass</th><td><label><input type="checkbox" name="turingate_settings[rest_require]" value="1" <?php checked($o['rest_require'], 1); ?>> Require a pass for <b>anonymous</b> REST writes (POST/PUT/DELETE without a login or a WordPress nonce)</label>
            <p class="description">Logged-in users and your own site's pages (which send a nonce) are never affected.</p></td></tr>
          <tr><th>Scopes</th><td>
            <input name="turingate_settings[read_scope]" class="code" value="<?php echo esc_attr($o['read_scope']); ?>" size="16"> reads ·
            <input name="turingate_settings[write_scope]" class="code" value="<?php echo esc_attr($o['write_scope']); ?>" size="16"> writes ·
            <input name="turingate_settings[checkout_scope]" class="code" value="<?php echo esc_attr($o['checkout_scope']); ?>" size="16"> WooCommerce checkout (checked against the owner's spending limit)</td></tr>
        </table>
        <details><summary>Advanced</summary>
          <table class="form-table" role="presentation"><tr><th><label for="tg-server">Turingate server</label></th><td><input id="tg-server" name="turingate_settings[server]" class="regular-text code" value="<?php echo esc_attr($o['server']); ?>"></td></tr></table>
        </details>
        <?php submit_button('Save settings'); ?>
      </form>
      <p><a class="button" href="<?php echo esc_url(add_query_arg('turingate_check', 1)); ?>">Test connection</a></p>
    </div>
    <?php
}

function turingate_check_connection() {
    if (!turingate_configured()) {
        return 'add your Site ID and API key first';
    }
    $r = turingate_api('/v1/verify', array('token' => 'connection-test'));
    if (is_wp_error($r)) {
        return $r->get_error_message();
    }
    return isset($r['valid']) ? true : 'unexpected response';
}

/* ------------------------------------------------------------------ API */

function turingate_api($path, $body) {
    $res = wp_remote_post(turingate_server() . $path, array(
        'timeout' => 8,
        'headers' => array('content-type' => 'application/json', 'x-site-key' => turingate_opt('site_key')),
        'body'    => wp_json_encode($body),
    ));
    if (is_wp_error($res)) {
        return $res;
    }
    $code = wp_remote_retrieve_response_code($res);
    $json = json_decode(wp_remote_retrieve_body($res), true);
    if ($code === 401) {
        return new WP_Error('turingate_key', 'Turingate rejected the API key. Check Settings → Turingate.');
    }
    if ($code !== 200 || !is_array($json)) {
        return new WP_Error('turingate_http', 'Turingate: ' . (is_array($json) && !empty($json['error']) ? $json['error'] : 'HTTP ' . $code));
    }
    return $json;
}

/** Verifies a pass. $need = array('scope' => ..., 'amount' => ..., 'requireBound' => bool). Returns claims array or WP_Error. */
function turingate_verify($token, $need = array()) {
    if (!turingate_configured()) {
        return new WP_Error('turingate_setup', 'Turingate is not configured on this site.');
    }
    if (!is_string($token) || !preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $token)) {
        return new WP_Error('turingate_pass', 'A valid Turingate agent pass is required.');
    }
    $body = array_merge(array('token' => $token), array_filter($need, function ($v) { return $v !== null && $v !== ''; }));
    $r = turingate_api('/v1/verify', $body);
    if (is_wp_error($r)) {
        return $r;
    }
    if (empty($r['valid'])) {
        return new WP_Error('turingate_pass', 'Agent pass rejected: ' . implode('; ', array_map('strval', (array) ($r['reasons'] ?? array()))));
    }
    $claims = (array) ($r['claims'] ?? array());
    if (!empty($claims['aud']) && $claims['aud'] !== turingate_opt('site_id')) {
        return new WP_Error('turingate_pass', 'This pass was issued for a different site.');
    }
    return $claims;
}

function turingate_bearer() {
    $h = '';
    foreach (array('HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION') as $k) {
        if (!empty($_SERVER[$k])) {
            $h = $_SERVER[$k];
            break;
        }
    }
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                $h = $value;
            }
        }
    }
    if ($h === '' && !empty($_SERVER['HTTP_X_AGENT_PASS'])) {
        return trim(wp_unslash($_SERVER['HTTP_X_AGENT_PASS']));
    }
    return preg_match('/^AgentPass\s+(\S+)$/i', trim(wp_unslash($h)), $m) ? $m[1] : '';
}

/* ------------------------------------------------------------------ agent requests (custom post type) */

add_action('init', function () {
    register_post_type('turingate_request', array(
        'labels'       => array('name' => 'Agent requests', 'singular_name' => 'Agent request', 'menu_name' => 'Agent requests'),
        'public'       => false,
        'show_ui'      => true,
        'show_in_menu' => true,
        'menu_icon'    => 'dashicons-superhero-alt',
        'supports'     => array('title', 'editor'),
        'capabilities' => array('create_posts' => 'do_not_allow'),
        'map_meta_cap' => true,
    ));
});

function turingate_desk_fields($spec) {
    $fields = array();
    foreach (array_filter(array_map('trim', explode(',', (string) $spec))) as $f) {
        $p = array_map('trim', explode(':', $f));
        $name = sanitize_key($p[0] ?? '');
        if ($name === '' || count($fields) >= 8) {
            continue;
        }
        $type = in_array($p[2] ?? 'text', array('text', 'email', 'textarea', 'number', 'date'), true) ? $p[2] : 'text';
        $fields[$name] = array('label' => $p[1] ?? $name, 'type' => $type, 'required' => ($p[3] ?? '') === 'required');
    }
    return $fields ?: turingate_desk_fields('name:Name of the person you act for:text:required,email:Their email:email,message:Request:textarea:required');
}

function turingate_desk_spec($hash = null) {
    $specs = (array) get_option('turingate_desk_specs', array());
    $hash = $hash ?: get_option('turingate_desk_last');
    return isset($specs[$hash]) ? $specs[$hash] : '';
}

/** Validates fields + pass and stores the request. Returns post ID or WP_Error. */
function turingate_accept_request($token, $values, $fields) {
    $claims = turingate_verify($token, array('requireBound' => turingate_opt('require_bound') ? true : null));
    if (is_wp_error($claims)) {
        return $claims;
    }
    $clean = array();
    foreach ($fields as $name => $f) {
        $v = isset($values[$name]) ? (string) $values[$name] : '';
        $v = $f['type'] === 'textarea' ? sanitize_textarea_field(wp_unslash($v)) : sanitize_text_field(wp_unslash($v));
        $v = mb_substr($v, 0, $f['type'] === 'textarea' ? 4000 : 200);
        if ($v === '' && $f['required']) {
            return new WP_Error('turingate_field', sprintf('"%s" is required.', $f['label']));
        }
        if ($v !== '' && $f['type'] === 'email' && !is_email($v)) {
            return new WP_Error('turingate_field', sprintf('"%s" must be an email address.', $f['label']));
        }
        if ($v !== '') {
            $clean[$name] = $v;
        }
    }
    $jti = sanitize_text_field($claims['jti'] ?? '');
    if ($jti === '' || get_posts(array('post_type' => 'turingate_request', 'post_status' => 'any', 'meta_key' => '_turingate_jti', 'meta_value' => $jti, 'fields' => 'ids', 'numberposts' => 1))) {
        return new WP_Error('turingate_used', 'This pass has already been used for a request.');
    }
    $agent = sanitize_text_field($claims['agent_name'] ?? '') ?: (!empty($claims['sub']) ? 'unnamed agent' : 'anonymous agent');
    $owner = sanitize_text_field($claims['prn_name'] ?? '');
    $lines = array();
    foreach ($clean as $k => $v) {
        $lines[] = $fields[$k]['label'] . ': ' . $v;
    }
    $id = wp_insert_post(array(
        'post_type'    => 'turingate_request',
        'post_status'  => 'private',
        'post_title'   => $owner ? sprintf('%s for %s', $agent, $owner) : $agent,
        'post_content' => implode("\n\n", $lines),
    ), true);
    if (is_wp_error($id)) {
        return $id;
    }
    update_post_meta($id, '_turingate_jti', $jti);
    update_post_meta($id, '_turingate_token', $token);
    update_post_meta($id, '_turingate_claims', array_intersect_key($claims, array_flip(array('sub', 'agent_name', 'prn', 'prn_name', 'tier', 'lvl', 'solve_ms', 'scopes', 'rep'))));
    update_post_meta($id, '_turingate_fields', $clean);
    $to = turingate_opt('notify_email', get_option('admin_email'));
    if ($to) {
        $who = $owner ? sprintf('%s on behalf of %s (tier %d)', $agent, $owner, (int) ($claims['tier'] ?? 0)) : $agent . ' (anonymous pass)';
        wp_mail($to, sprintf('[%s] New request from an AI agent', wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES)),
            "A verified AI agent sent a request through your Turingate agent desk.\n\nFrom: $who\n\n" . implode("\n", $lines)
            . "\n\nSee all requests: " . admin_url('edit.php?post_type=turingate_request'));
    }
    do_action('turingate_request_received', $id, $clean, $claims);
    return $id;
}

/* shortcode: [turingate_agent_desk fields="name:Name:text:required,message:Request:textarea:required" button="Send request"] */
add_shortcode('turingate_agent_desk', function ($atts) {
    $atts = shortcode_atts(array('fields' => '', 'button' => 'Send request'), $atts, 'turingate_agent_desk');
    if (!turingate_configured()) {
        return current_user_can('manage_options') ? '<p><em>Turingate: add your Site ID and API key under Settings → Turingate.</em></p>' : '';
    }
    $fields = turingate_desk_fields($atts['fields']);
    // Remember this page's field list server-side; the form only carries its hash, so agents can't change the fields.
    $hash = substr(md5((string) $atts['fields']), 0, 12);
    $specs = (array) get_option('turingate_desk_specs', array());
    if (!isset($specs[$hash]) || get_option('turingate_desk_last') !== $hash) {
        $specs[$hash] = (string) $atts['fields'];
        update_option('turingate_desk_specs', array_slice($specs, -20, null, true), false);
        update_option('turingate_desk_last', $hash, false);
    }
    $out = '';
    if (isset($_GET['turingate_sent'])) {
        $out .= '<p class="turingate-ok" role="status">✓ Request sent. Thank you.</p>';
    }
    if (!empty($_GET['turingate_error'])) {
        $out .= '<p class="turingate-error" role="alert">' . esc_html(wp_unslash($_GET['turingate_error'])) . '</p>';
    }
    $out .= '<form class="turingate-desk" method="post" action="' . esc_url(remove_query_arg(array('turingate_sent', 'turingate_error'))) . '">';
    $out .= '<input type="hidden" name="turingate_desk" value="' . esc_attr($hash) . '">';
    foreach ($fields as $name => $f) {
        $req = $f['required'] ? ' required' : '';
        $out .= '<p><label>' . esc_html($f['label']) . ($f['required'] ? ' *' : '') . '<br>';
        $out .= $f['type'] === 'textarea'
            ? '<textarea name="' . esc_attr($name) . '" rows="5" maxlength="4000"' . $req . '></textarea>'
            : '<input type="' . esc_attr($f['type'] === 'number' ? 'number' : ($f['type'] === 'date' ? 'date' : ($f['type'] === 'email' ? 'email' : 'text'))) . '" name="' . esc_attr($name) . '" maxlength="200"' . $req . '>';
        $out .= '</label></p>';
    }
    $out .= '<div data-reverse-captcha data-site="' . esc_attr(turingate_opt('site_id')) . '"></div>';
    $out .= '<p><button type="submit">' . esc_html($atts['button']) . '</button></p>';
    $out .= '<p class="turingate-note"><small>This form is for AI assistants acting for people. It uses a reverse CAPTCHA, so humans can\'t submit it. Agents can also POST JSON to <code>' . esc_html(rest_url('turingate/v1/desk')) . '</code> with <code>Authorization: AgentPass …</code>.</small></p>';
    $out .= '</form>';
    wp_enqueue_script('turingate-widget', turingate_server() . '/widget.js', array(), null, true);
    return $out;
});

// Browser submissions from the shortcode form (post/redirect/get).
add_action('template_redirect', function () {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_POST['turingate_desk'])) {
        return;
    }
    $fields = turingate_desk_fields(turingate_desk_spec(sanitize_key(wp_unslash($_POST['turingate_desk']))));
    $token = isset($_POST['rc-pass']) ? sanitize_text_field(wp_unslash($_POST['rc-pass'])) : '';
    $r = turingate_accept_request($token, $_POST, $fields);
    $back = remove_query_arg(array('turingate_sent', 'turingate_error'), wp_get_referer() ?: home_url(add_query_arg(array())));
    wp_safe_redirect(is_wp_error($r) ? add_query_arg('turingate_error', rawurlencode($r->get_error_message()), $back) : add_query_arg('turingate_sent', '1', $back), 303);
    exit;
});

// API for agents: GET describes the desk, POST submits a request.
add_action('rest_api_init', function () {
    register_rest_route('turingate/v1', '/desk', array(
        array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function () {
            return array(
                'site' => turingate_opt('site_id'), 'fields' => turingate_desk_fields(turingate_desk_spec()), 'requireVerifiedOwner' => (bool) turingate_opt('require_bound'),
                'submit' => array('method' => 'POST', 'url' => rest_url('turingate/v1/desk'), 'auth' => 'Authorization: AgentPass <pass for site ' . turingate_opt('site_id') . '>'),
            );
        }),
        array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
            $values = $req->get_json_params() ?: $req->get_body_params();
            if (isset($values['fields']) && is_array($values['fields'])) {
                $values = $values['fields'];
            }
            $r = turingate_accept_request(turingate_bearer(), (array) $values, turingate_desk_fields(turingate_desk_spec()));
            if (is_wp_error($r)) {
                $status = in_array($r->get_error_code(), array('turingate_pass', 'turingate_setup'), true) ? 401 : ($r->get_error_code() === 'turingate_used' ? 409 : 400);
                return new WP_Error($r->get_error_code(), $r->get_error_message(), array('status' => $status));
            }
            return array('ok' => true, 'id' => $r);
        }),
    ));
});

/* ------------------------------------------------------------------ REST agent lane (incl. WooCommerce) */

$GLOBALS['turingate_claims'] = null;

/** The verified pass claims for the current request, or null. For use by themes and other plugins. */
function turingate_current_agent() {
    return $GLOBALS['turingate_claims'];
}

add_filter('rest_authentication_errors', function ($result) {
    if (!empty($result) || !turingate_opt('rest_lane') || !turingate_configured()) {
        return $result;
    }
    $route = isset($GLOBALS['wp']->query_vars['rest_route']) ? (string) $GLOBALS['wp']->query_vars['rest_route'] : (string) ($_SERVER['REQUEST_URI'] ?? '');
    if (strpos($route, '/turingate/v1/') !== false) {
        return $result; // the desk endpoint checks passes itself
    }
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $write = !in_array($method, array('GET', 'HEAD', 'OPTIONS'), true);
    $token = turingate_bearer();
    if ($token === '') {
        $has_nonce = !empty($_SERVER['HTTP_X_WP_NONCE']) || !empty($_SERVER['HTTP_NONCE']);
        if ($write && turingate_opt('rest_require') && !is_user_logged_in() && !$has_nonce) {
            return new WP_Error('turingate_pass_required', 'AI agents need a Turingate pass for this site.', array('status' => 401));
        }
        return $result;
    }
    $need = array('scope' => $write ? turingate_opt('write_scope', 'api:write') : turingate_opt('read_scope', 'api:read'));
    if ($write && preg_match('#/wc/store(/v1)?/checkout#', $route)) {
        $need['scope'] = turingate_opt('checkout_scope', 'shop:checkout');
        if (function_exists('WC') && WC()->cart) {
            $need['amount'] = (float) WC()->cart->get_total('edit');
            $need['currency'] = get_woocommerce_currency();
        }
    }
    $claims = turingate_verify($token, $need);
    if (is_wp_error($claims)) {
        return new WP_Error('turingate_invalid_pass', $claims->get_error_message(), array('status' => 403));
    }
    $GLOBALS['turingate_claims'] = $claims;
    return $result;
}, 99);

add_filter('rest_post_dispatch', function ($response) {
    if ($response instanceof WP_REST_Response || $response instanceof WP_HTTP_Response) {
        $data = $response->get_data();
        if (is_array($data) && ($data['code'] ?? '') === 'turingate_pass_required') {
            $response->header('WWW-Authenticate', 'AgentPass site="' . turingate_opt('site_id') . '"');
        }
        $c = turingate_current_agent();
        if ($c) {
            $response->header('X-Turingate-Agent', (string) ($c['agent_name'] ?? 'agent'));
            if (!empty($c['prn_name'])) {
                $response->header('X-Turingate-Owner', (string) $c['prn_name']);
            }
        }
    }
    return $response;
});

/* ------------------------------------------------------------------ discovery */

add_action('wp_head', function () {
    if (turingate_opt('site_id')) {
        echo '<meta name="turingate-site" content="' . esc_attr(turingate_opt('site_id')) . "\">\n";
    }
});

add_action('send_headers', function () {
    $page = (int) turingate_opt('desk_page');
    if ($page && turingate_opt('site_id') && !headers_sent()) {
        header('Link: <' . esc_url_raw(get_permalink($page)) . '>; rel="agent-desk"', false);
    }
});

/* ------------------------------------------------------------------ admin: agent request details + report abuse */

add_filter('manage_turingate_request_posts_columns', function ($cols) {
    return array('cb' => $cols['cb'], 'title' => 'Agent', 'turingate_owner' => 'Verified owner', 'turingate_solve' => 'Passed in', 'date' => 'Received');
});

add_action('manage_turingate_request_posts_custom_column', function ($col, $id) {
    $c = (array) get_post_meta($id, '_turingate_claims', true);
    if ($col === 'turingate_owner') {
        echo !empty($c['prn_name']) ? esc_html($c['prn_name'] . ' · tier ' . (int) ($c['tier'] ?? 0)) : '<em>anonymous pass</em>';
    }
    if ($col === 'turingate_solve' && !empty($c['solve_ms'])) {
        echo esc_html(number_format_i18n($c['solve_ms'] / 1000, 1) . ' s');
    }
}, 10, 2);

add_filter('post_row_actions', function ($actions, $post) {
    $c = $post->post_type === 'turingate_request' ? (array) get_post_meta($post->ID, '_turingate_claims', true) : array();
    if ($post->post_type === 'turingate_request' && current_user_can('manage_options') && ($c['lvl'] ?? '') === 'bound' && !get_post_meta($post->ID, '_turingate_reported', true)) {
        $url = wp_nonce_url(admin_url('admin-post.php?action=turingate_report&post=' . $post->ID), 'turingate_report_' . $post->ID);
        $actions['turingate_report'] = '<a href="' . esc_url($url) . '" style="color:#b32d2e" onclick="return confirm(\'Report this agent for abuse? Repeated reports block it and its owner on every Turingate site.\')">Report abuse</a>';
    }
    return $actions;
}, 10, 2);

add_action('admin_post_turingate_report', function () {
    $id = absint($_GET['post'] ?? 0);
    if (!current_user_can('manage_options') || !wp_verify_nonce($_GET['_wpnonce'] ?? '', 'turingate_report_' . $id)) {
        wp_die('Not allowed.');
    }
    $token = (string) get_post_meta($id, '_turingate_token', true);
    $r = turingate_api('/v1/reports', array('token' => $token, 'outcome' => 'abuse'));
    update_post_meta($id, '_turingate_reported', is_wp_error($r) ? $r->get_error_message() : 'reported');
    wp_safe_redirect(add_query_arg('turingate_reported', is_wp_error($r) ? 0 : 1, admin_url('edit.php?post_type=turingate_request')));
    exit;
});

add_action('admin_notices', function () {
    if (isset($_GET['turingate_reported'])) {
        $ok = $_GET['turingate_reported'] === '1';
        echo '<div class="notice ' . ($ok ? 'notice-success' : 'notice-error') . ' is-dismissible"><p>' . ($ok ? 'Reported. Thank you for keeping the network safe.' : 'Could not report this agent (it may already have been reported).') . '</p></div>';
    }
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if ($screen && in_array($screen->id, array('edit-turingate_request', 'plugins'), true) && !turingate_configured() && current_user_can('manage_options')) {
        echo '<div class="notice notice-warning"><p>Turingate: add your Site ID and API key in <a href="' . esc_url(admin_url('options-general.php?page=turingate')) . '">Settings → Turingate</a>.</p></div>';
    }
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=turingate')) . '">Settings</a>');
    return $links;
});
