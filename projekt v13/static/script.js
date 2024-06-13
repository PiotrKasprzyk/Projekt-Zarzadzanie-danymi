let map;
let markers = [];
let currentUser = null;
let selectedMarker = null;

// Dodajemy ścieżkę do ikony zielonego markera
const greenMarkerIcon = 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';

function initMap() {
    try {
        map = new google.maps.Map(document.getElementById('map'), {
            center: { lat: 20.0, lng: 0.0 },
            zoom: 2
        });

        // Pole wyszukiwania
        const input = document.getElementById("pac-input");
        const searchBox = new google.maps.places.SearchBox(input);
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

        // Bias the SearchBox results towards current map's viewport.
        map.addListener("bounds_changed", () => {
            searchBox.setBounds(map.getBounds());
        });

        searchBox.addListener("places_changed", () => {
            const places = searchBox.getPlaces();

            if (places.length == 0) {
                return;
            }

            // Clear out the old markers.
            markers.forEach((marker) => {
                marker.setMap(null);
            });
            markers = [];

            // For each place, get the icon, name and location.
            const bounds = new google.maps.LatLngBounds();
            places.forEach((place) => {
                if (!place.geometry || !place.geometry.location) {
                    console.log("Returned place contains no geometry");
                    return;
                }

                const icon = {
                    url: place.icon,
                    size: new google.maps.Size(71, 71),
                    origin: new google.maps.Point(0, 0),
                    anchor: new google.maps.Point(17, 34),
                    scaledSize: new google.maps.Size(25, 25),
                };

                // Create a marker for each place.
                const marker = new google.maps.Marker({
                    map,
                    icon,
                    title: place.name,
                    position: place.geometry.location,
                });

                markers.push(marker);

                if (place.geometry.viewport) {
                    // Only geocodes have viewport.
                    bounds.union(place.geometry.viewport);
                } else {
                    bounds.extend(place.geometry.location);
                }
            });
            map.fitBounds(bounds);
        });

        map.addListener('click', function(event) {
            if (currentUser) {
                document.getElementById('marker-lat').value = event.latLng.lat();
                document.getElementById('marker-lng').value = event.latLng.lng();
                document.getElementById('marker-id').value = '';
                document.getElementById('marker-title').value = '';
                document.getElementById('marker-description').value = '';
                document.getElementById('delete-marker').style.display = 'none';
                document.getElementById('marker-form').style.display = 'block';
            }
        });

        fetchMarkers();
        fetchWorldHeritageSites(); // Dodana funkcja do pobierania zabytków świata
    } catch (error) {
        console.error("Error initializing map:", error);
    }
}

function fetchWorldHeritageSites() {
    console.log("Fetching world heritage sites...");
    const query = `
        SELECT ?site ?siteLabel ?lat ?lon ?article WHERE {
            ?site wdt:P1435 wd:Q9259;
                  p:P625 ?coordinate.
            ?coordinate psv:P625 ?coordinate_node.
            ?coordinate_node wikibase:geoLatitude ?lat.
            ?coordinate_node wikibase:geoLongitude ?lon.
            ?article schema:about ?site;
                     schema:inLanguage "en";
                     schema:isPartOf <https://en.wikipedia.org/>.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 100
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const results = data.results.bindings;
            console.log("Results:", results);
            for (let i = 0; i < results.length; i++) {
                const place = results[i];
                const position = {
                    lat: parseFloat(place.lat.value),
                    lng: parseFloat(place.lon.value)
                };
                const title = place.siteLabel.value;
                const link = place.article.value;
                addHeritageMarker(position, title, link);
            }
        })
        .catch(error => {
            console.error("Error fetching world heritage sites:", error);
        });
}

function addHeritageMarker(position, title, link) {
    const marker = new google.maps.Marker({
        map: map,
        position: position,
        title: title,
    });

    const infoWindow = new google.maps.InfoWindow({
        content: `<div><strong>${title}</strong><br><a href="${link}" target="_blank">Wikipedia</a></div>`
    });

    marker.addListener('click', function() {
        infoWindow.open(map, marker);
    });

    markers.push(marker);
}

function addMarker(location, title, description, id, userId) {
    try {
        const marker = new google.maps.Marker({
            position: location,
            map: map,
            draggable: true,
            title: title || "Nowy zabytek",
            id: id,
            icon: greenMarkerIcon // Ustawienie zielonego markera
        });

        let contentString = `
            <div>
                <h3>${title || "Nowy zabytek"}</h3>
                <p>${description || "Opis zabytku"}</p>
        `;

        if (currentUser === userId) {
            contentString += `
                <button onclick="editMarker(${id})">Edytuj</button>
                <button onclick="deleteMarker(${id})">Usuń</button>
            `;
        }

        contentString += `</div>`;

        const infoWindow = new google.maps.InfoWindow({
            content: contentString
        });

        marker.addListener('click', function() {
            infoWindow.open(map, marker);
        });

        markers.push(marker);
        return marker;
    } catch (error) {
        console.error("Error adding marker:", error);
    }
}

function saveMarker(markerData) {
    fetch('/add_marker', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(markerData)
    }).then(response => response.json())
      .then(data => {
          if (data.success) {
              const marker = markers.find(m => m.id === markerData.id);
              if (marker) {
                  marker.setPosition(new google.maps.LatLng(markerData.lat, markerData.lng));
                  marker.setTitle(markerData.title);
              } else {
                  addMarker(new google.maps.LatLng(markerData.lat, markerData.lng), markerData.title, markerData.description, data.id, currentUser);
              }
          } else {
              console.error("Error saving marker:", data.message);
          }
      }).catch(error => {
          console.error("Error saving marker:", error);
      });
}

function fetchMarkers() {
    fetch('/get_markers')
        .then(response => response.json())
        .then(data => {
            data.forEach(markerData => {
                addMarker(new google.maps.LatLng(markerData.lat, markerData.lng), markerData.title, markerData.description, markerData.id, markerData.user_id);
            });
        }).catch(error => {
            console.error("Error fetching markers:", error);
        });
}

function editMarker(markerId) {
    try {
        const marker = markers.find(m => m.id === markerId);
        if (marker) {
            console.log('Editing marker:', marker);
            document.getElementById('marker-title').value = marker.title;
            document.getElementById('marker-description').value = marker.description;
            document.getElementById('marker-id').value = marker.id;
            document.getElementById('marker-lat').value = marker.getPosition().lat();
            document.getElementById('marker-lng').value = marker.getPosition().lng();
            document.getElementById('delete-marker').style.display = 'inline';
            document.getElementById('marker-form').style.display = 'block';
            selectedMarker = marker;
        }
    } catch (error) {
        console.error("Error editing marker:", error);
    }
}

document.getElementById('edit-marker-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const markerData = {
        id: parseInt(document.getElementById('marker-id').value),
        title: document.getElementById('marker-title').value,
        description: document.getElementById('marker-description').value,
        lat: parseFloat(document.getElementById('marker-lat').value),
        lng: parseFloat(document.getElementById('marker-lng').value)
    };

    console.log('Submitting edit form with data:', markerData);

    if (markerData.id) {
        fetch(`/edit_marker/${markerData.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(markerData)
        }).then(response => response.json())
          .then(data => {
              if (data.success) {
                  selectedMarker.setTitle(markerData.title);
                  selectedMarker.setPosition(new google.maps.LatLng(markerData.lat, markerData.lng));
                  selectedMarker.description = markerData.description;
                  document.getElementById('marker-form').style.display = 'none';
                  console.log('Marker updated:', selectedMarker);
              } else {
                  console.error("Error editing marker:", data.message);
              }
          }).catch(error => {
              console.error("Error editing marker:", error);
          });
    } else {
        saveMarker(markerData);
        document.getElementById('marker-form').style.display = 'none';
    }
});

function deleteMarker(markerId) {
    fetch(`/delete_marker/${markerId}`, {
        method: 'POST'
    }).then(response => response.json())
      .then(data => {
          if (data.success) {
              const marker = markers.find(m => m.id === markerId);
              if (marker) {
                  marker.setMap(null);
                  markers = markers.filter(m => m.id !== markerId);
              }
              document.getElementById('marker-form').style.display = 'none';
          } else {
              console.error("Error deleting marker:", data.message);
          }
      }).catch(error => {
          console.error("Error deleting marker:", error);
      });
}

document.getElementById('delete-marker').addEventListener('click', function() {
    const markerId = parseInt(document.getElementById('marker-id').value);
    if (markerId) {
        deleteMarker(markerId);
    }
});

document.getElementById('cancel-edit').addEventListener('click', function() {
    document.getElementById('marker-form').style.display = 'none';
});

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = data.user_id;
            document.getElementById('login').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block';
        } else {
            alert('Login failed');
        }
    }).catch(error => {
        console.error("Error logging in:", error);
    });
});

document.getElementById('register-form').addEventListener('submit', function(e) {
    e.preventDefault();
    console.log('Register form submitted');
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;

    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Register response', data);
        if (data.success) {
            document.getElementById('register').style.display = 'none';
            document.getElementById('login').style.display = 'block';
        } else {
            alert('Registration failed');
        }
    }).catch(error => {
        console.error("Error registering:", error);
    });
});

document.getElementById('register-btn').addEventListener('click', function() {
    console.log('Register button clicked');
    document.getElementById('login').style.display = 'none';
    document.getElementById('register').style.display = 'block';
});

document.getElementById('login-btn').addEventListener('click', function() {
    console.log('Login button clicked');
    document.getElementById('register').style.display = 'none';
    document.getElementById('login').style.display = 'block';
});

document.getElementById('logout-btn').addEventListener('click', function() {
    currentUser = null;
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('login').style.display = 'block';
    markers.forEach(marker => marker.setMap(null)); // Usuwa markery z mapy
    markers = [];
    fetchMarkers(); // Ponownie pobiera markery po wylogowaniu
});
