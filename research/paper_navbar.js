// Ported from original Metaball script by SATO Hiroyuki
// http://park12.wakwak.com/~shp/lc/et/en_aics_script.html
project.currentStyle = {
    fillColor: 'white'
};

var handle_len_rate = 2.4;
var circlePaths = [];

var navCircle1 = new Path.Circle({
    center: ballPositions[nav_selected],
    radius: 32.5,
    applyMatrix: false
});
var navCircle2 = new Path.Circle({
    center: ballPositions[nav_selected],
    radius: 32.5,
    applyMatrix: false
});

circlePaths.push(navCircle1);
circlePaths.push(navCircle2);

function nav_animate(window_scroll) {
    return 0;
}
var scroll_position = nav_selected;

function onFrame() {
    if (nav_to != nav_selected) {
        scroll_position += (nav_to-nav_selected)/50;

        if (nav_to-nav_selected > 0) {
            if (scroll_position > nav_to) {
                scroll_position = nav_to;
                nav_selected = nav_to;
            }
        }
        if (nav_to-nav_selected < 0) {
            if (scroll_position < nav_to) {
                scroll_position = nav_to;
                nav_selected = nav_to;
            }
        }

        if (scroll_position == 0 || scroll_position == 1 || scroll_position == 2 || scroll_position == 3 || scroll_position == 4) {
            navCircle1.position = ballPositions[scroll_position];
            navCircle2.position = ballPositions[scroll_position];
        }
        if (scroll_position > 0 && scroll_position < 1) {
            navCircle1.position = [ballPositions[0][0], (ballPositions[1][1]-ballPositions[0][1])*scroll_position + ballPositions[0][1]];
        }
        if (scroll_position > 1 && scroll_position < 2) {
            navCircle1.position = [ballPositions[1][0], (ballPositions[2][1]-ballPositions[1][1])*(scroll_position-1) + ballPositions[1][1]];
        }
        if (scroll_position > 2 && scroll_position < 3) {
            navCircle1.position = [ballPositions[2][0], (ballPositions[3][1]-ballPositions[2][1])*(scroll_position-2) + ballPositions[2][1]];
        }
        if (scroll_position > 3 && scroll_position < 4) {
            navCircle1.position = [ballPositions[3][0], (ballPositions[4][1]-ballPositions[3][1])*(scroll_position-3) + ballPositions[3][1]];
        }
        generateConnections(circlePaths);
    }
}

var connections = new Group();
function generateConnections(paths) {
    // Remove the last connection paths:
    connections.children = [];

    for (var i = 0, l = paths.length; i < l; i++) {
        for (var j = i - 1; j >= 0; j--) {
            var path = metaball(paths[i], paths[j], 0.5, handle_len_rate, 100);
            if (path) {
                connections.appendTop(path);
                path.removeOnMove();
            }
        }
    }
}

generateConnections(circlePaths);

// ---------------------------------------------
function metaball(ball1, ball2, v, handle_len_rate, maxDistance) {
    var center1 = ball1.position;
    var center2 = ball2.position;
    var radius1 = ball1.bounds.width / 2;
    var radius2 = ball2.bounds.width / 2;
    var pi2 = Math.PI / 2;
    var d = center1.getDistance(center2);
    var u1, u2;

    if (radius1 == 0 || radius2 == 0)
        return;

    if (d > maxDistance || d <= Math.abs(radius1 - radius2)) {
        return;
    } else if (d < radius1 + radius2) { // case circles are overlapping
        u1 = Math.acos((radius1 * radius1 + d * d - radius2 * radius2) /
                (2 * radius1 * d));
        u2 = Math.acos((radius2 * radius2 + d * d - radius1 * radius1) /
                (2 * radius2 * d));
    } else {
        u1 = 0;
        u2 = 0;
    }

    var angle1 = (center2 - center1).getAngleInRadians();
    var angle2 = Math.acos((radius1 - radius2) / d);
    var angle1a = angle1 + u1 + (angle2 - u1) * v;
    var angle1b = angle1 - u1 - (angle2 - u1) * v;
    var angle2a = angle1 + Math.PI - u2 - (Math.PI - u2 - angle2) * v;
    var angle2b = angle1 - Math.PI + u2 + (Math.PI - u2 - angle2) * v;
    var p1a = center1 + getVector(angle1a, radius1);
    var p1b = center1 + getVector(angle1b, radius1);
    var p2a = center2 + getVector(angle2a, radius2);
    var p2b = center2 + getVector(angle2b, radius2);

    // define handle length by the distance between
    // both ends of the curve to draw
    var totalRadius = (radius1 + radius2);
    var d2 = Math.min(v * handle_len_rate, (p1a - p2a).length / totalRadius);

    // case circles are overlapping:
    d2 *= Math.min(1, d * 2 / (radius1 + radius2));

    radius1 *= d2;
    radius2 *= d2;

    var path = new Path({
        segments: [p1a, p2a, p2b, p1b],
        style: ball1.style,
        closed: true
    });
    var segments = path.segments;
    segments[0].handleOut = getVector(angle1a - pi2, radius1);
    segments[1].handleIn = getVector(angle2a + pi2, radius2);
    segments[2].handleOut = getVector(angle2b - pi2, radius2);
    segments[3].handleIn = getVector(angle1b + pi2, radius1);
    return path;
}

// ------------------------------------------------
function getVector(radians, length) {
    return new Point({
        // Convert radians to degrees:
        angle: radians * 180 / Math.PI,
        length: length
    });
}