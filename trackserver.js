var Trackserver = (function () {

    return {

        mapdata: {},
        mydata: {},
        timer: false,
        adminmap: false,

        Mapicon: L.Icon.extend({
            options: {
                iconSize:     [15, 15],
                iconAnchor:   [8, 8],
                popupAnchor:  [0, 8]
            }
        }),

        init: function (mapdata) {
            this.mapdata = mapdata;
            this.create_maps();
        },

        get_mydata: function(div_id, prop) {
            if (this.mydata.hasOwnProperty(div_id)) {
                if (this.mydata[div_id].hasOwnProperty(prop)) {
                    return this.mydata[div_id][prop];
                }
            }
            return false;
        },

        set_mydata: function (div_id, prop, value) {
            if (!this.mydata.hasOwnProperty(div_id)) {
                this.mydata[div_id] = {};
            }
            this.mydata[div_id][prop] = value;
        },

        process_data: function (data, options) {
            var o = typeof data === 'string' ?  JSON.parse(data) : data;
            var title = o.metadata.last_trkpt_time;
            this.set_mydata(options.div_id, 'title', title);
            return o.track;
        },

        get_sorted_keys: function( obj ) {
            var keys = [];
            for ( var key in obj ) {
                if ( obj.hasOwnProperty( key ) ) {
                    keys.push( key );
                }
            }
            keys.sort();
            return keys;
        },

        draw_track: function (map, mymapdata) {

            var div_id = mymapdata.div_id;

            if (mymapdata.track_url) {
                var start_icon = new this.Mapicon ({iconUrl: trackserver_settings['iconpath'] + 'greendot_15.png'});
                var end_icon = new this.Mapicon ({iconUrl: trackserver_settings['iconpath'] + 'reddot_15.png'});

                var old_track = this.get_mydata(div_id, 'track');
                var old_markers = this.get_mydata(div_id, 'markers');

                var _this = this;

                var customLayer = false;
                if (mymapdata.style) {
                    var layer_options = {
                        'style': mymapdata.style
                    };
                    customLayer = L.geoJson(null, layer_options);
                }
                var track_function = omnivore.polyline;
                var track_options = { 'ondata': L.bind( this.process_data, this ), 'div_id': div_id };

                if ( mymapdata.track_type == 'gpx' ) {
                    track_function = omnivore.gpx;
                    track_options = { 'div_id': div_id };
                }

                // First draw the new track...
                var runLayer = track_function(mymapdata.track_url, track_options, customLayer )
                    .on ('ready', function () {

                        // ...and then delete the old one, to prevent flickering
                        if (old_track) map.removeLayer (old_track);

                        // Remove any old markers
                        if (old_markers) {
                            for ( var i = 0; i < old_markers.length; ++i ) {
                                map.removeLayer( old_markers[i] );
                            }
                        }

                        if (mymapdata.markers) {

                            var end_title = _this.get_mydata(div_id, 'title');
                            var layer_ids = _this.get_sorted_keys( this._layers );
                            var id, layer, start_latlng, end_latlng, start_marker, end_marker;
                            var markers = [];

                            for ( var i = 0; i < layer_ids.length; ++i ) {
                                id = layer_ids[i];
                                layer = this._layers[id];
                                start_latlng = layer._latlngs[0];
                                end_latlng   = layer._latlngs[ layer._latlngs.length - 1 ];
                                start_marker = new L.marker(start_latlng, {icon: start_icon}).addTo(map);
                                end_marker   = new L.marker(end_latlng, {icon: end_icon, title: end_title }).addTo(map);
                                markers.push(start_marker);
                                markers.push(end_marker);
                            }
                            _this.set_mydata(div_id, 'markers', markers);
                        }

                        if (mymapdata.is_live) {
                            // Then, center the map on the last point / current position
                            this._map.setView(end_latlng, map.getZoom());
                        }
                        else {
                            // or fit the entire track on the map
                            this._map.fitBounds(this.getBounds());
                        }
                    })
                    .on('error', function(err) {
                        var str = err.error.status + ' ' + err.error.statusText + ' - ' + err.error.responseText;
                        var popup = L.popup()
                            .setLatLng(center)
                            .setContent("Track could not be loaded:<br />" + str).openOn(this._map);
                    })
                    .addTo(map);
                this.set_mydata(div_id, 'track', runLayer);
            }
        },

        // Callback function to update the track.
        // Wrapper for 'draw_track' that gets its data from the liveupdate object.
        update_track: function (liveupdate) {

            var map        = liveupdate._map,
                mymapdata  = liveupdate.options.mymapdata;

            this.draw_track( map, mymapdata );
        },

        create_maps: function () {
            /*
                'div_id'       => $div_id,
                'track_url'    => $track_url,
                'default_lat'  => '51.44815',
                'default_lon'  => '5.47279',
                'default_zoom' => '12',
                'fullscreen'   => true,
            */

            var mapdata = this.mapdata;

            for (i = 0; i < mapdata.length; i++) {

                var lat        = parseFloat (mapdata[i]['default_lat']);
                var lon        = parseFloat (mapdata[i]['default_lon']);
                var zoom       = parseInt (mapdata[i]['default_zoom']);
                var center     = L.latLng(lat, lon);

                var mymapdata  = mapdata[i];

                /*
                 * The map div in the admin screen is re-used when viewing multiple maps.
                 * When closing the thickbox, the map object is normally removed and the
                 * div freed of Leaflet bindings, but just in case something goes wrong
                 * there, we have a fallback here, that empties the div and sets ._leaflet
                 * to false, making re-initialization possible.
                 */
                var container = L.DomUtil.get( mymapdata.div_id );
                if (container._leaflet) {
                    jQuery(container).empty();
                    container._leaflet = false;
                }

                var map_layer0 = L.tileLayer(
                    trackserver_settings['tile_url'],
                    { attribution: trackserver_settings['attribution'], maxZoom: 18 });

                var options = {center : center, zoom : zoom, layers: [map_layer0], messagebox: true };
                var map = L.map( mymapdata.div_id, options );

                // An ugly shortcut to be able to destroy the map in WP admin
                if ( mymapdata.div_id == 'tsadminmap' ) {
                    this.adminmap = map;
                }

                if (mymapdata.fullscreen) {
                    L.control.fullscreen().addTo(map);
                }

                // Load and display the track. Use the liveupdate control to do it when appropriate.
                if (mymapdata.is_live) {
                    L.control.liveupdate ({
                        mymapdata: mymapdata,
                        update_map: L.bind(this.update_track, this)
                    })
                    .addTo( map )
                    .startUpdating();
                }
                else {
                    this.draw_track ( map, mymapdata );
                }
            }
        }
    };

})();


// Requires global variable 'trackserver_mapdata' to be set
if (typeof trackserver_mapdata != 'undefined')
{
    Trackserver.init( trackserver_mapdata );
}
