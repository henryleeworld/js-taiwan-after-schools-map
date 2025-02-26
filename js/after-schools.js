var sidebar = new ol.control.Sidebar({
    element: 'sidebar',
    position: 'right'
});
var jsonFiles, filesLength, fileKey = 0;

var projection = ol.proj.get('EPSG:3857');
var projectionExtent = projection.getExtent();
var size = ol.extent.getWidth(projectionExtent) / 256;
var resolutions = new Array(20);
var matrixIds = new Array(20);
for (var z = 0; z < 20; ++z) {
    resolutions[z] = size / Math.pow(2, z);
    matrixIds[z] = z;
}

var cityList = {};
var filterCity = '',
    filterTown = '';
var filterExtent = false;

function pointStyle(f) {
    var p = f.getProperties();
    if (selectedCounty !== p.county) {
        return null;
    }

    let color, stroke, radius, rotation = 0;

    if (f === currentFeature) {
        color = '#FF9800';
        stroke = new ol.style.Stroke({
            color: '#FFF',
            width: 3
        });
        radius = 22;
    } else {
        color = '#4CAF50';
        stroke = new ol.style.Stroke({
            color: '#FFF',
            width: 2
        });
        radius = 18;
    }

    let style = {
        image: new ol.style.RegularShape({
            points: 5,
            radius: radius,
            radius2: radius * 0.5,
            fill: new ol.style.Fill({
                color: color
            }),
            stroke: stroke,
            rotation: Math.PI / 2,
            displacement: [0, 0]
        })
    };

    const currentZoom = map.getView().getZoom();
    if (currentZoom >= 15) {
        style.text = new ol.style.Text({
            text: p.name,
            offsetY: radius + 15,
            font: '14px "Open Sans", "Arial Unicode MS", "sans-serif"',
            fill: new ol.style.Fill({
                color: '#333'
            }),
            stroke: new ol.style.Stroke({
                color: '#fff',
                width: 3
            }),
            textAlign: 'center'
        });
    }

    return new ol.style.Style(style);
}
var sidebarTitle = document.getElementById('sidebarTitle');
var content = document.getElementById('infoBox');
var slipBox = document.getElementById('slipBox');

var appView = new ol.View({
    center: ol.proj.fromLonLat([121.563900, 25.034030]),
    zoom: 9
});

var pointFormat = new ol.format.GeoJSON({
    featureProjection: appView.getProjection()
});

var clusterSource = new ol.source.Cluster({
    distance: 40,
    source: new ol.source.Vector({
        format: pointFormat
    })
});

function clusterStyle(feature) {
    var size = feature.get('features').length;
    var style;

    if (size === 1) {
        return pointStyle(feature.get('features')[0]);
    }

    style = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 20,
            fill: new ol.style.Fill({
                color: '#4CAF50'
            }),
            stroke: new ol.style.Stroke({
                color: '#fff',
                width: 2
            })
        }),
        text: new ol.style.Text({
            text: size.toString(),
            fill: new ol.style.Fill({
                color: '#fff'
            }),
            font: 'bold 14px Arial'
        })
    });

    return style;
}

var vectorPoints = new ol.layer.Vector({
    source: clusterSource,
    style: clusterStyle
});

var baseLayer = new ol.layer.Tile({
    source: new ol.source.WMTS({
        matrixSet: 'EPSG:3857',
        format: 'image/png',
        url: 'https://wmts.nlsc.gov.tw/wmts',
        layer: 'EMAP',
        tileGrid: new ol.tilegrid.WMTS({
            origin: ol.extent.getTopLeft(projectionExtent),
            resolutions: resolutions,
            matrixIds: matrixIds
        }),
        style: 'default',
        wrapX: true,
        attributions: '<a href="http://maps.nlsc.gov.tw/" target="_blank">國土測繪圖資服務雲</a>'
    }),
    opacity: 0.8
});

function countyStyle(f) {
    var p = f.getProperties();
    if (selectedCounty === p.COUNTYNAME) {
        return null;
    }
    var color = '#ffffff';
    var strokeWidth = 1;
    var strokeColor = 'rgba(0,0,0,0.3)';
    var cityKey = p.COUNTYNAME;
    var textColor = '#000000';
    var baseStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: strokeColor,
            width: strokeWidth
        }),
        fill: new ol.style.Fill({
            color: color
        }),
        text: new ol.style.Text({
            font: '14px "Open Sans", "Arial Unicode MS", "sans-serif"',
            text: p.COUNTYNAME,
            fill: new ol.style.Fill({
                color: textColor
            })
        })
    });
    return baseStyle;
}

var county = new ol.layer.Vector({
    source: new ol.source.Vector({
        url: 'data/20200820.json',
        format: new ol.format.TopoJSON({
            featureProjection: appView.getProjection()
        })
    }),
    style: countyStyle,
    zIndex: 50
});

var map = new ol.Map({
    layers: [baseLayer, county, vectorPoints],
    target: 'map',
    view: appView
});

map.once('prerender', function() {
    const canvas = map.getTargetElement().querySelector('canvas');
    if (canvas) {
        const context = canvas.getContext('2d', {
            willReadFrequently: true
        });
        canvas.getContext = function() {
            return context;
        };
    }
});

map.addControl(sidebar);
var pointClicked = false;
var selectedCounty = '';
var pointsPool = {};
var rawMap = {
    '臺中市': '台中市',
    '臺北市': '台北市',
    '臺南市': '台南市',
    '臺東市': '台東市',
};

var spiderFeatures = [];
var spiderLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#666',
            width: 1
        })
    }),
    zIndex: 100
});

map.addLayer(spiderLayer);

function createSpiderFeature(center, feature, index, count) {
    var angle = (2 * Math.PI * index) / count;
    var radius = 40;
    var x = center[0] + (radius * Math.cos(angle));
    var y = center[1] + (radius * Math.sin(angle));

    var line = new ol.Feature({
        geometry: new ol.geom.LineString([center, [x, y]])
    });

    var point = new ol.Feature({
        geometry: new ol.geom.Point([x, y]),
        originalFeature: feature
    });

    return [line, point];
}

function clearSpider() {
    spiderLayer.getSource().clear();
    spiderFeatures = [];
}

function setupSearch() {
    let searchData = [];

    function updateSearchData() {
        searchData = [];
        const features = clusterSource.getSource().getFeatures();
        features.forEach(function(feature) {
            const props = feature.getProperties();
            if (props.name && props.code) {
                searchData.push({
                    label: props.name,
                    value: props.name,
                    code: props.code,
                    county: props.county
                });
            }
        });
    }

    $('#feature-search').autocomplete({
        minLength: 1,
        position: {
            my: "left top+2",
            at: "left bottom"
        },
        source: function(request, response) {
            const term = request.term.toLowerCase();
            const matches = searchData.filter(function(item) {
                return item.label.toLowerCase().indexOf(term) !== -1;
            });
            response(matches);
        },
        select: function(event, ui) {
            if (ui.item.county && ui.item.code) {
                routie(ui.item.county + '/' + ui.item.code);
            }
        }
    }).autocomplete('instance')._renderItem = function(ul, item) {
        $(ul).addClass('autocomplete-above-sidebar');
        return $('<li>')
            .append('<div>' + item.label + '</div>')
            .appendTo(ul);
    };

    clusterSource.getSource().on('change', function() {
        updateSearchData();
    });
}

map.once('postrender', setupSearch);

function showFeatureDetails(feature) {
    if (!feature) return;

    clearSpider();
    currentFeature = feature;
    var p = feature.getProperties();
    var targetCounty = selectedCounty;
    if (rawMap[selectedCounty]) {
        targetCounty = rawMap[selectedCounty];
    }

    const geometry = feature.getGeometry();
    const coordinates = geometry.getCoordinates();
    map.getView().animate({
        center: coordinates,
        duration: 1000
    });

    $.getJSON('data/raw/' + targetCounty + '/' + p.code + '.json', function(c) {
        clusterSource.getSource().refresh();
        var lonLat = ol.proj.toLonLat(p.geometry.getCoordinates());
        var message = '<table class="table table-dark">';
        message += '<tbody>';
        message += '<tr><th scope="row" style="width: 100px;">名稱</th><td>' + c.補習班名稱 + '</td></tr>';
        message += '<tr><th scope="row">電話</th><td>' + c.電話 + '</td></tr>';
        message += '<tr><th scope="row">住址</th><td>' + c.地址 + '</td></tr>';
        message += '<tr><td colspan="2">';
        message += '<hr /><div class="btn-group-vertical" role="group" style="width: 100%;">';
        message += '<a href="https://www.google.com/maps/dir/?api=1&destination=' + lonLat[1] + ',' + lonLat[0] + '&travelmode=driving" target="_blank" class="btn btn-info btn-lg btn-block">Google 導航</a>';
        message += '<a href="https://wego.here.com/directions/drive/mylocation/' + lonLat[1] + ',' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Here WeGo 導航</a>';
        message += '<a href="https://bing.com/maps/default.aspx?rtp=~pos.' + lonLat[1] + '_' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Bing 導航</a>';
        message += '</div></td></tr>';
        message += '<tr><th scope="row">班主任</th><td>';
        for (k in c["班主任"]) {
            message += c["班主任"][k] + ',';
        }
        message += '</td></tr>';
        message += '<tr><th scope="row">職員工</th><td>';
        for (k in c["職員工"]) {
            message += c["職員工"][k] + ',';
        }
        message += '</td></tr>';
        message += '<tr><th scope="row">負責人</th><td>';
        for (k in c["負責人"]) {
            message += c["負責人"][k] + ',';
        }
        message += '</td></tr>';
        message += '<tr><th scope="row">設立人</th><td>';
        for (k in c["設立人"]) {
            message += c["設立人"][k] + ',';
        }
        message += '</td></tr>';
        message += '<tr><th scope="row">傳真號碼</th><td>' + c.傳真號碼 + '</td></tr>';
        message += '<tr><th scope="row">教室數</th><td>' + c.教室數 + '</td></tr>';
        message += '<tr><th scope="row">教室面積</th><td>' + c.教室面積 + '</td></tr>';
        message += '<tr><th scope="row">班舍總面積</th><td>' + c.班舍總面積 + '</td></tr>';
        message += '<tr><th scope="row">立案情形</th><td>' + c.立案情形 + '</td></tr>';
        message += '<tr><th scope="row">立案日期</th><td>' + c.立案日期 + '</td></tr>';
        message += '<tr><th scope="row">補習班英文名稱</th><td>' + c.補習班英文名稱 + '</td></tr>';
        message += '<tr><th scope="row">英文地址</th><td>' + c.英文地址 + '</td></tr>';
        message += '<tr><th scope="row">補習班類別/科目</th><td>' + c["補習班類別/科目"] + '</td></tr>';
        message += '</tbody></table>';
        sidebarTitle.innerHTML = p.name;
        content.innerHTML = message;
        sidebar.open('home');
        message = '';
        for (k in c.核准科目) {
            message += '<table class="table table-dark"><tbody>';
            for (l in c.核准科目[k]) {
                message += '<tr><th scope="row">' + l + '</th><td>' + c.核准科目[k][l] + '</td></tr>';
            }
            message += '</tbody></table>';
        }
        slipBox.innerHTML = message;
    });
}

routie({
    '': function() {
        currentFeature = false;
        clusterSource.getSource().refresh();
        sidebar.close();
    },
    ':countyName/:code': function(countyName, code) {
        selectedCounty = countyName;
        if (!pointsPool[selectedCounty]) {
            $.getJSON('data/map/' + selectedCounty + '.json', function(c) {
                pointsPool[selectedCounty] = true;
                clusterSource.getSource().addFeatures(pointFormat.readFeatures(c));
                clusterSource.refresh();

                var features = clusterSource.getSource().getFeatures();
                var targetFeature = features.find(f => f.get('code') === code);
                if (targetFeature) {
                    showFeatureDetails(targetFeature);
                }
            });
        } else {
            var features = clusterSource.getSource().getFeatures();
            var targetFeature = features.find(f => f.get('code') === code);
            if (targetFeature) {
                showFeatureDetails(targetFeature);
            }
        }
        county.getSource().refresh();
    }
});

map.on('singleclick', function(evt) {
    content.innerHTML = '';
    pointClicked = false;

    map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
        if (false === pointClicked) {
            pointClicked = true;

            if (layer === spiderLayer) {
                var originalFeature = feature.get('originalFeature');
                if (originalFeature) {
                    var p = originalFeature.getProperties();
                    if (p.code) {
                        routie(selectedCounty + '/' + p.code);
                    }
                }
                return;
            }

            if (layer === county) {
                var p = feature.getProperties();
                if (p.COUNTYNAME) {
                    selectedCounty = p.COUNTYNAME;
                    if (!pointsPool[selectedCounty]) {
                        $.getJSON('data/map/' + selectedCounty + '.json', function(c) {
                            pointsPool[selectedCounty] = true;
                            clusterSource.getSource().addFeatures(pointFormat.readFeatures(c));
                            clusterSource.refresh();
                        });
                    } else {
                        clusterSource.refresh();
                    }
                    county.getSource().refresh();
                    clearSpider();
                    routie('');
                    return;
                }
            }

            var features = feature.get('features');
            if (features) {
                if (features.length === 1) {
                    var p = features[0].getProperties();
                    if (p.code) {
                        routie(selectedCounty + '/' + p.code);
                    }
                } else {
                    clearSpider();
                    sidebar.close();

                    var center = feature.getGeometry().getCoordinates();
                    var currentZoom = map.getView().getZoom();

                    map.getView().animate({
                        center: center,
                        zoom: currentZoom + 1,
                        duration: 500
                    });

                    features.forEach((f, i) => {
                        var spiderFeats = createSpiderFeature(center, f, i, features.length);
                        spiderFeatures.push(...spiderFeats);
                    });
                    spiderLayer.getSource().addFeatures(spiderFeatures);
                }
            }
        }
    });

    if (!pointClicked) {
        clearSpider();
        currentFeature = false;
        clusterSource.getSource().refresh();
        sidebar.close();
        routie('');
    }
});

var previousFeature = false;
var currentFeature = false;

var geolocation = new ol.Geolocation({
    projection: appView.getProjection()
});

geolocation.setTracking(true);

geolocation.on('error', function(error) {
    console.log(error.message);
});

var positionFeature = new ol.Feature();

positionFeature.setStyle(new ol.style.Style({
    image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({
            color: '#3399CC'
        }),
        stroke: new ol.style.Stroke({
            color: '#fff',
            width: 2
        })
    })
}));

var firstPosDone = false;
geolocation.on('change:position', function() {
    var coordinates = geolocation.getPosition();
    positionFeature.setGeometry(coordinates ? new ol.geom.Point(coordinates) : null);
    if (false === firstPosDone) {
        map.dispatchEvent({
            type: 'singleclick',
            coordinate: coordinates,
            pixel: map.getPixelFromCoordinate(coordinates)
        });
        appView.setCenter(coordinates);
        firstPosDone = true;
    }
});

new ol.layer.Vector({
    map: map,
    source: new ol.source.Vector({
        features: [positionFeature]
    })
});

$('#btn-geolocation').click(function() {
    var coordinates = geolocation.getPosition();
    if (coordinates) {
        appView.setCenter(coordinates);
    } else {
        alert('目前使用的設備無法提供地理資訊');
    }
    return false;
});

map.getView().on('change:resolution', function() {
    clearSpider();
    clusterSource.getSource().refresh();
});