<?php
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
delete_option('turingate_settings');
delete_option('turingate_desk_specs');
delete_option('turingate_desk_last');
