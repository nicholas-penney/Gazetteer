<?php

/*              Import utils                */

function getStartAndEndOfCurrentIntervals()
{
    /**
     * Return format:
     * array: [
     *   "min":  [start_unix, end_unix],
     *   "hour": [start_unix, end_unix],
     *   "day":  [start_unix, end_unix],
     *   "mon":  [start_unix, end_unix],
     * ]
     */
    
    // CONST
    $SECS_IN_MINUTE = 60;
    $SECS_IN_HOUR = 3600;
    $SECS_IN_DAY = 86400;
    
    // Get date
    $now_date = getdate();

    // Unpack date
    $now_seconds = $now_date['seconds'];
    $now_minutes = $now_date['minutes'];
    $now_month = $now_date['mon'];
    $now_year = $now_date['year'];
    $now_unix = $now_date[0];

    // Minute
    $min_start_unix = $now_unix - $now_seconds;
    $min_end_unix = $min_start_unix + $SECS_IN_MINUTE;
    $min_array = [$min_start_unix, $min_end_unix];

    // Hour
    $now_minutes_in_secs = $now_minutes * $SECS_IN_MINUTE;
    $hour_start_unix = $now_unix - $now_minutes_in_secs - $now_seconds;
    $hour_end_unix = $hour_start_unix + $SECS_IN_HOUR;
    $hour_array = [$hour_start_unix, $hour_end_unix];

    // Day
    $days_since_epoch = floor($now_unix / $SECS_IN_DAY);
    $day_start_unix = $days_since_epoch * $SECS_IN_DAY;
    $day_end_unix = $day_start_unix + $SECS_IN_DAY;
    $day_array = [$day_start_unix, $day_end_unix];

    // Month
    $utc_zone = new DateTimeZone("GMT0");
    $mon_start_date_string = "1-${now_month}-${now_year}";
    $mon_start_date = DateTime::createFromFormat('d-m-Y', $mon_start_date_string, $utc_zone);
    $mon_start_date->setTime(0,0);

    $mon_end_date = DateTime::createFromFormat('d-m-Y', $mon_start_date_string, $utc_zone);
    $mon_end_date->setTime(0,0);
    $mon_end_date->modify('+1 month');

    $mon_start_unix = $mon_start_date->getTimestamp();
    $mon_end_unix = $mon_end_date->getTimestamp();
    $mon_array = [$mon_start_unix, $mon_end_unix];
    
    // Return
    $rtn_assoc = [];
    $rtn_assoc['min'] = $min_array;
    $rtn_assoc['hour'] = $hour_array;
    $rtn_assoc['day'] = $day_array;
    $rtn_assoc['mon'] = $mon_array;

    return $rtn_assoc;
}

/*              Setup               */

// Check params
if (!isset($_GET['id'])) badRequest();
if (!isset($_GET['z'])) badRequest();
if (!isset($_GET['x'])) badRequest();
if (!isset($_GET['y'])) badRequest();

/*              Parse request               */
$id_raw = $_GET["id"];
$z_str = $_GET["z"];
$x_str = $_GET["x"];
$y_str = $_GET["y"];

// Convert/cast
$map_id = rawToMapId($id_raw);
$z = intval($z_str);
$x = intval($x_str);
$y = intval($y_str);

// Data integrity check
$xyz_strings = [$z_str, $x_str, $y_str];
$xyz_ints = [$z, $x, $y];
for ($i = 0; $i < count($xyz_ints); $i++) {
    $xyz_int = $xyz_ints[$i];
    $xyz_string = $xyz_strings[$i];
    if ($xyz_int == 0 && $xyz_string != "0") badRequest();
}
$provider = mapIdToProvider($map_id);
// Data parsed and cast
// Check DB

// Check IP for spamming (429)
$client_ip = "";
if (!isset($_SERVER['REMOTE_ADDR'])) {
    // IP not found, return 429 error
    clientSpam();
}
// Got IP
$client_ip = $_SERVER['REMOTE_ADDR'];

/*              Connect to database             */

// Check db conn (500)
// SQL DB connection variables
$host_name = file_get_contents('../keys/sqlhostname.txt');
$database = file_get_contents('../keys/sqldatabase.txt');
$user_name = file_get_contents('../keys/sqlusername.txt');
$password = file_get_contents('../keys/sqlpass.txt');

// Connection to DB
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = null;
try {
    $conn = new mysqli($host_name, $user_name, $password, $database);
} catch (\Throwable $th) {
    // SQL conn error
    internalServer();
}

$interval_start_end_obj = getStartAndEndOfCurrentIntervals();
// [ min, hour, day, mon ]
//   min = [start, end] etc

if (is_null($interval_start_end_obj)) {
    // Data integrity check
    $conn->close();
    internalServer();
}

// Check db IP tables for too many requests
$interval_keys = ["mon", "day", "hour", "min"];
    
$max_hits_for_interval_types = getMaxHitsForIntervalTypes($conn, $provider);
// { mon: int, day: int, hour: int, min: int }

if (is_null($max_hits_for_interval_types)) {
    // IP max allowable table not found, return 500 error
    $conn->close();
    internalServer();
}

// Get interval values for user's IP
$client_counts = getUserIntervalCounts($conn, $provider, $client_ip);
$intervals_to_add = [];
$id_and_new_vals = [];
$id_and_start_unix_to_resets = [];

$too_many_requests = false;

// Loop through intervals and check db for too many IP
foreach($interval_keys as $interval_type) {
    $current_start_end = $interval_start_end_obj[$interval_type];
    $current_start_unix = $current_start_end[0];
    if (!isset($client_counts[$interval_type])) {
        // Add new row for client & interval type
        $new_interval = [];
        $new_interval['interval_type'] = $interval_type;
        $new_interval['start_unix'] = $current_start_unix;
        array_push($intervals_to_add, $new_interval);
        continue;
    }
    $client_count = $client_counts[$interval_type];
    // Edge case check, should never fail
    if (!isset($max_hits_for_interval_types[$interval_type])) {
        continue;
    }

    // Check if row needs resetting to 0 with new start_unix
    $id = $client_count['id'];
    $row_start_unix = $client_count['start_unix'];
    if ($row_start_unix < $current_start_unix) {
        // Row is in the past, reset to current start unix
        $reset_obj = [];
        $reset_obj['id'] = $id;
        $reset_obj['start_unix'] = $current_start_unix;
        array_push($id_and_start_unix_to_resets, $reset_obj);
        continue;
    }

    // Row is still current,
    // Increment
    $max = $max_hits_for_interval_types[$interval_type];
    $interval_count = $client_count['interval_count'];
    if ($interval_count > $max) {
        // Too many requests for this interval, don't increment this interval type, but check the rest also
        $too_many_requests = true;
        continue;
    }
    // Not spamming thsi interval, increment to new value
    $new_count = $interval_count + 1;
    $id_and_new_val = [];
    $id_and_new_val['id'] = $id;
    $id_and_new_val['interval_count'] = $new_count;
    array_push($id_and_new_vals, $id_and_new_val);
}

// Got array of rows to add, IDs to increment, and if user has spammed any intervals

// Add new rows
if (count($intervals_to_add) > 0) {
    addNewRows($conn, $provider, $client_ip, $intervals_to_add);
}

// Increment IDs
if (count($id_and_new_vals) > 0) {
    setNewIntervalCounts($conn, $provider, $id_and_new_vals);
}

// Reset IDs
if (count($id_and_start_unix_to_resets) > 0) {
    resetIntervalCounts($conn, $provider, $id_and_start_unix_to_resets);
}

// If spamming, exit
if ($too_many_requests) {
    $conn->close();
    clientSpam();
}

// If reached here, not spamming, return tile...

// Check if provider allows tile caching
$provider_allows_cache = providerAllowsCaching($provider);

// If provider allows cache:
// Check DB for recent tile

// If cache tile exists & not expired, return cache tile
$id_expiry_extension = null;
$unix_now = time();
$dir_path = "../../images/tiles/${provider}/${map_id}/${z}/${x}/";
$extension = null;
$ctype = getCtype($map_id);
$max_age = 0;

$db_id = null;
if ($provider_allows_cache) {
    $id_expiry_extension = searchForTileIdAndExpiryAndExtension($conn, $provider, $map_id, $z, $x, $y);
    if (!is_null($id_expiry_extension)) {
        // Check if expiry is in the past or future...
        $expiry_unix = $id_expiry_extension['expiry_unix'];
        $extension = $id_expiry_extension['extension'];
        $db_id = $id_expiry_extension['id'];
        $ctype = genCtypeFromExtension($extension);
        if ($expiry_unix > $unix_now) {
            // If expiry is in future:
            // Fetch tile from cache
            $file_full_path = "${dir_path}${y}";
            if ($extension !== "" && $extension !== null) {
                $file_full_path = "${file_full_path}.${extension}";
            }
            $blob = getFileFromStorage($file_full_path);
            if (!is_null($blob)) {
                // DB success
                $conn->close();
                $max_age = $expiry_unix - $unix_now;
                // Set expiry header
                header("Cache-Control: max-age=${max_age},s-maxage=${max_age}");
                header("Content-type: ${ctype}");
                // Return
                die($blob);
            }
            // Server error, continue to API...
        }
        // If expiry is in past, continue to API...
    }
    // If reach here, no tile found in DB, fetch new from API...
}

// If cache not allowed, or tile not found, fetch new from API
$url = getUrl($map_id, $z, $x, $y);
// Call API
$blob_and_headers = fetchPngExternalApiAndHeader($url);
// Blob
$blob = $blob_and_headers['blob'];
// Headers to parse for Max-Age and Ctype
$headers = $blob_and_headers['header'];
// Max age
//$max_age_or_null = parseMaxAgeFromHeader($headers);
$max_age_or_null = 86400;
if (!is_null($max_age_or_null)) $max_age = $max_age_or_null;
// Ctype
$ctype = parseCtypeFromHeader($headers);

// Cache tile if possible
if ($provider_allows_cache) {
    $extension = genExtensionFromCtype($ctype);
    if (is_null($extension)) $extension = getExtension($map_id);
    if (is_null($extension)) $extension = 'png';
    $extension = $conn->real_escape_string($extension);
    $file_full_path = "${dir_path}${y}.${extension}";
    // Cache allowed
    $file_success = cachePngToServer($blob, $dir_path, $file_full_path);
    if ($file_success) {
        // Either update row, or add new row
        $table_prefix = 'tile_expiry_';
        $table_name = $table_prefix . $provider;
        $expiry_unix = $unix_now + $max_age;
        if (is_null($db_id)) {
            // New row
            $tile_expiry_post_sql =
            "INSERT INTO ${table_name}
            ( map_id, z, x, y, expiry_unix, extension )
            VALUES
            ( '${map_id}', ${z}, ${x}, ${y}, ${expiry_unix}, '${extension}' );"
            ;

            $result = $conn->query($tile_expiry_post_sql);
        } else {
            // Update row
            $tile_expiry_put_sql =
            "UPDATE ${table_name}
            SET expiry_unix = ${expiry_unix}, extension = '${extension}'
            WHERE id = ${db_id};"
            ;

            $result = $conn->query($tile_expiry_put_sql);
        }
        // DB updated
    }
}

// Return blob
$conn->close();
if ($provider_allows_cache && $max_age > 0) {
    // Set expiry header
    header("Cache-Control: max-age=${max_age},s-maxage=${max_age}");
}
// Set Ctype
header("Content-type: ${ctype}");
die($blob);



/*      Methods     */

// Get the maximum allowable IP hits for a interval types
// : { mon: int, day: int, hour: int, min: int }
function getMaxHitsForIntervalTypes($conn, $provider)
{
    $field_names = 'interval_type, interval_max';
    $table_name = 'ip_hit_tile_max';
    $ip_hit_max_sql =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE provider = '${provider}';"
    ;

    $result = $conn->query($ip_hit_max_sql);

    // Check if there are any hits for IP in that interval range
    if ($result->num_rows != 0) {
        // Success, parse output and return assoc array
        $interval_type_max = [];
        while($row = $result->fetch_assoc()) {
            if (!isset($row['interval_type'])) {
                // Row error
                return null;
            }
            if (!isset($row['interval_max'])) {
                // Row error
                return null;
            }
            // Row data success
            $interval_type = $row['interval_type'];
            $interval_max = intval($row['interval_max']);
            $interval_type_max[$interval_type] = $interval_max;
        }
        // Success
        $result->close();
        $conn->next_result();
        return $interval_type_max;
    }
    return null;
}


// Check DB for user's IP to prevent spamming
// : { interval_type: {id, interval_count}, key: { val, val }, ... ]
// : []
function getUserIntervalCounts($conn, $provider, $client_ip)
{
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Generate SQL query
    $col_names = ['id', 'interval_type', 'interval_count, start_unix'];
    $field_names = implode(', ', $col_names);
    $sql_get =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE ip_address = '${client_ip}';"
    ;
    $result = $conn->query($sql_get);

    // Check if there are any hits for IP in that interval range
    $rtn_obj = [];
    while($row = $result->fetch_assoc()) {
        $row_obj = [];
        // Data check interval type
        if (!isset($row['interval_type'])) continue;
        $interval_type = $row['interval_type'];
        if ($interval_type == "") continue;
        // ID
        if (!isset($row['id'])) continue;
        $id_string = $row['id'];
        if ($id_string == "") continue;
        $id = intval($id_string);
        if ($id == 0) continue;
        // interval_count
        if (!isset($row['interval_count'])) continue;
        $interval_count_string = $row['interval_count'];
        if ($interval_count_string == "") continue;
        $interval_count_int = intval($interval_count_string);
        if ($interval_count_int == 0) continue;
        // start_unix
        if (!isset($row['start_unix'])) continue;
        $start_unix_string = $row['start_unix'];
        if ($start_unix_string == "") continue;
        $start_unix_int = intval($start_unix_string);
        if ($start_unix_int == 0) continue;
        $row_obj['id'] = $id;
        $row_obj['interval_count'] = $interval_count_int;
        $row_obj['start_unix'] = $start_unix_int;
        $rtn_obj[$interval_type] = $row_obj;
    }
    if ($result != false && $result != true) {
        $result->close();
    }
    $conn->next_result();
    return $rtn_obj;
}

function addNewRows(
    $conn,
    $provider,
    $client_ip,
    $intervals
) {
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($intervals as $interval) {
        // Generate SQL query
        $interval_type = $interval['interval_type'];
        $start_unix = $interval['start_unix'];
        $sql_post =
        "INSERT INTO ${table_name}
        ( ip_address, interval_type, interval_count, start_unix )
        VALUES
        ( '${client_ip}', '${interval_type}', 1, ${start_unix} );"
        ;
        array_push($sql_string_array, $sql_post);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);
    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function setNewIntervalCounts($conn, $provider, $ips_and_vals)
{
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($ips_and_vals as $ips_and_val) {
        $id = $ips_and_val['id'];
        $interval_count = $ips_and_val['interval_count'];
        // Generate SQL query
        $sql_put = 
        "UPDATE ${table_name}
        SET interval_count = ${interval_count}
        WHERE id = ${id};"
        ;
        array_push($sql_string_array, $sql_put);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);

    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function resetIntervalCounts($conn, $provider, $id_and_start_unix_to_resets)
{
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($id_and_start_unix_to_resets as $id_and_start_unix_to_reset) {
        $id = $id_and_start_unix_to_reset['id'];
        $start_unix = $id_and_start_unix_to_reset['start_unix'];
        // Generate SQL query
        $sql_put = 
        "UPDATE ${table_name}
        SET start_unix = ${start_unix}, interval_count = 1
        WHERE id = ${id};"
        ;
        array_push($sql_string_array, $sql_put);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);

    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function fetchPngExternalApi($url)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    $blob = curl_exec($ch);
    curl_close($ch);

    if (!$blob) {
        // Error
        return false;
    }
    // Image
    return $blob;
}

function fetchPngExternalApiAndHeader($url)
{
    function parseHeader($rawHeader) {
        $header = array();
        $lines = preg_split('/\r\n|\r|\n/', $rawHeader);
        foreach ($lines as $key => $line) {
            $keyval = explode(': ', $line, 2);
            if (isset($keyval[0]) && isset($keyval[1])) {
                $header[strtolower($keyval[0])] = $keyval[1];
            }
        }
        return $header;
    }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_HEADER, true);
    $response = curl_exec($ch);

    // Get response header
    $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $header_string = substr($response, 0, $header_size);
    $header_assoc = parseHeader($header_string);

    $blob = substr($response, $header_size);

    curl_close($ch);

    if (!$blob) {
        // Error
        return false;
    }
    // Image
    $rtn_obj = [];
    $rtn_obj['header'] = $header_assoc;
    $rtn_obj['blob'] = $blob;
    return $rtn_obj;
}

function cachePngToServer($blob, $dir_path, $file_full_path)
{
    function _createDirsIfNeeded($dir_path) {
        // Check for dir
        if (file_exists($dir_path)) {
            // File or folder found...
            if (is_dir($dir_path)) {
                // Folder already exists
                return true;
            } else {
                // Error, target folder is a file
                return false;
            }
        }
    
        try {
            // Dir missing: Create
            // Setup
            $permissions = 0770;
            $recursive = true;
            $dir_success = mkdir($dir_path, $permissions, $recursive);
            if (!$dir_success) {
                // Error
                return false;
            }
        } catch (Exception $e) {
            return false;
        }
    
    
        // Check dir has now been created
        if (file_exists($dir_path)) {
            // File or folder found...
            if (is_dir($dir_path)) {
                // Now exists
                return true;
            } else {
                // Error, target folder is a file
                return false;
            }
        }
    
        // Error if reached here
        return false;
    }
    // Create directory if not created
    $dir_success = _createDirsIfNeeded($dir_path);
    if (!$dir_success) {
        return false;
    }

    // Write png file
    $bytes_written = file_put_contents($file_full_path, $blob);

    if ($bytes_written == false) {
        // Error writing file
        return false;
    }
    // Success
    return true;
}


/*              Helper methods              */

function rawToMapId($map_id_raw)
{   // Pigeon-hole incoming ID param
    switch ($map_id_raw) {
        //case 'street': 
        case 'transport':
        case 'dark':
        //case 'sat':
        //case 'night':
        //case 'topo':
        //case 'ocean':
        case 'temp':
        case 'rain':
            return $map_id_raw;
        default: 
            badRequest();
    }
}

function mapIdToProvider($map_id)
{   // Pigeon-hole parsed ID param
    switch ($map_id) {
        case 'street':
            return 'openstreetmap';
        case 'transport':
            return 'thunderforest';
        case 'dark':
            return 'stadiamaps';
        case 'sat':
        case 'ocean':
            return 'arcgisonline';
        case 'night':
            return 'nasa';
        case 'topo':
            return 'opentopomap';
        case 'temp':
        case 'rain':
            return 'openweathermap';
        default:
            badRequest();
    }
}

function providerAllowsCaching($provider)
{
    // do needle/haystack
    switch ($provider) {
        case 'openstreetmap':
        case 'thunderforest':
        case 'stadiamaps':
        case 'arcgisonline':
        case 'nasa':
        case 'opentopomap':
        case 'openweathermap':
            return true;
        default:
            return false;
    }
}

function searchForTileIdAndExpiryAndExtension(
    $conn,
    $provider,
    $map_id,
    $z,
    $x,
    $y
) {
    $table_prefix = 'tile_expiry_';
    $table_name = $table_prefix . $provider;

    $tile_expiry_sql =
    "SELECT id, expiry_unix, extension
    FROM ${table_name}
    WHERE map_id = '${map_id}'
    AND z = ${z}
    AND x = ${x}
    AND y = ${y};"
    ;
    $conn->next_result();
    $result = $conn->query($tile_expiry_sql);
    if ($result->num_rows == 1) {
        // Unpack and return: id, expiry_unix
        $row = $result->fetch_assoc();
        // ID
        $id = $row['id'];
        // Expiry
        $expiry_unix = $row['expiry_unix'];
        // extension
        $extension = $row['extension'];
        $rtn_obj = [];
        $rtn_obj['id'] = $id;
        $rtn_obj['expiry_unix'] = $expiry_unix;
        $rtn_obj['extension'] = $extension;
        $result->close();
        $conn->next_result();
        return $rtn_obj;
    }
    if ($result != false && $result != true) {
        $result->close();
    }
    $conn->next_result();
    return null;
}

function getExtension($map_id)
{
    $png = 'png';
    $jpeg = 'jpeg';
    switch ($map_id) {
        case 'street':
        case 'transport': 
        case 'dark':
        case 'topo':
        case 'temp':
        case 'rain': return $png; break;
        case 'sat':
        case 'night':
        case 'ocean': return $jpeg; break;
    }
    return $png;
}

function getCtype($map_id)
{
    $png = 'image/png';
    $jpeg = 'image/jpeg';
    $gzip = 'gzip';
    switch ($map_id) {
        case 'street':
        case 'transport': 
        case 'dark':
        case 'topo':
        case 'temp':
        case 'rain': return $png; break;
        case 'sat':
        case 'night':
        case 'ocean': return $jpeg; break;
    }
    return $png;
}

function parseCtypeFromHeader($header)
{
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; // .vector.pbf
    if (isset($header['content-type'])) {
        $content_type = $header['content-type'];
        switch($content_type) {
            case $png:
            case $jpeg:
            case $jpg:
            case $gzip:
                return $content_type; break;
        }
        $prefix_pos = strpos($content_type, $prefix);
        if ($prefix_pos !== false) {
            if ($prefix_pos === 0) {
                $content_type_len = strlen($content_type);
                if ($content_type_len > 12) $content_type = substr($content_type, 0, 12);
                return $content_type;
            }
        }
    }
    return '';
}

function genCtypeFromExtension($extension)
{
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; 
    switch($extension) {
        case 'png': return $png; break;
        case 'jpeg': return $jpeg; break;
        case 'jpg': return $jpg; break;
        case 'vector.pbf': return $gzip; break;
    }
    return $png;
}

function genExtensionFromCtype($ctype)
{
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; 
    switch($ctype) {
        case $png: return 'png'; break;
        case $jpeg: return 'jpeg'; break;
        case $jpg: return 'jpg'; break;
        case $gzip: return 'vector.pbf'; break;
    }
    return null;
}

function getFileFromStorage($file_full_path)
{
    if (file_exists($file_full_path)) {
        if (!is_dir($file_full_path)) {
            // File found
            $file = file_get_contents($file_full_path);
            return $file;
        }
    }
    return null;
}

function getMaxAge($map_id)
{
    switch ($map_id) {
        case 'street':
            return 165280;
        case 'transport':
            return 21600;
        case 'dark':
            return 43200;
        case 'sat':
            return 86400;
        case 'night':
            return 0;
        case 'topo':
            return 604800;
        case 'ocean':
            return 86400;
        case 'temp':
            return 3600;
        case 'rain':
            return 3600;
        default:
            return 0;
    }
}

function parseMaxAgeFromHeader($header)
{
    if (!isset($header['cache-control'])) return null;
    $cache_control = $header['cache-control'];
    $pattern = '/max-age=([0-9]+)/';
    preg_match($pattern, $$cache_control, $matches, PREG_OFFSET_CAPTURE);
    if (!isset($matches[0])) return null;
    if (!isset($matches[0][0])) return null;
    $full_string = $matches[0][0];
    $suffix = 'max-age=';
    $seconds = substr($full_string, strlen($suffix));
    return $seconds;
}

function getUrl(
    $map_id,
    $z,
    $x,
    $y
) {
    $api_key = ""; 
    switch ($map_id) {
        case 'street':
            return "https://tile.openstreetmap.org/${z}/${x}/${y}.png";
        case 'transport':
            $api_key = file_get_contents('../keys/thunderforest.txt');
            return "https://tile.thunderforest.com/transport/${z}/${x}/${y}.png?apikey=${api_key}";
        case 'dark':
            $api_key = file_get_contents('../keys/stadiamaps.txt');
            return "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${z}/${x}/${y}.png?api_key=${api_key}";
        case 'sat':
            return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}";
        case 'night':
            return "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpg";
        case 'topo':
            return "https://tile.opentopomap.org/${z}/${x}/${y}.png";
        case 'ocean':
            return "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/${z}/${y}/${x}";
        case 'temp':
            $api_key = file_get_contents('../keys/openweathermap.txt');
            return "https://tile.openweathermap.org/map/temp_new/${z}/${x}/${y}.png?appid=${api_key}";
        case 'rain':
            $api_key = file_get_contents('../keys/openweathermap.txt');
            return "https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png?appid=${api_key}";
        default:
            return "";
    }
}


/* 2xx Success */

/* 4xx Client error */
function badRequest()
{
    $code = 400;
    http_response_code($code);
    die();
}
function clientSpam()
{
    $code = 429;
    http_response_code($code);
    die();
}
/* 5xx Server error */
function internalServer()
{
    $code = 500;
    http_response_code($code);
    die();
}
