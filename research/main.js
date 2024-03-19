const section_header = document.getElementById('section_header');
const section_levels = document.getElementsByClassName('level_section');
const nav_canvas = document.getElementById("nav_canvas");
const nav_bubble = document.getElementsByClassName("nav_bubble");

var nav_bubble_names = ['family', 'highschool', 'university', 'researcher', 'everything'];

var url = new URL(window.location);
var display_level = url.searchParams.get('lvl')
if (display_level == null || !nav_bubble_names.includes(display_level)) {
    display_level = 'family';
    url.searchParams.set('lvl', 'family');
    window.history.replaceState({}, '', url);
}
var nav_selected = nav_bubble_names.findIndex(element => element == display_level);
var nav_to = nav_bubble_names.findIndex(element => element == display_level);
section_header.innerHTML = "<p>My Research: " + display_level +  " friendly version</p>";
if (display_level == 'everything') {
    section_header.innerHTML = "<p>My Research: in full detail!</p>";
}
section_levels[nav_selected].style.display = "inherit";

var nav_bubble_positions = [];
for (let i = 0; i < nav_bubble.length; i++) {
    nav_bubble_positions.push([nav_bubble[i].getBoundingClientRect().left,nav_bubble[i].getBoundingClientRect().right,nav_bubble[i].getBoundingClientRect().top,nav_bubble[i].getBoundingClientRect().bottom]);
}
var nav_canvas_top = nav_canvas.getBoundingClientRect().top;
var nav_canvas_left = nav_canvas.getBoundingClientRect().left;

var ballPositions = [];
for (let i = 0; i < nav_bubble.length; i++) {
    ballPositions.push([(nav_bubble_positions[i][1]-nav_bubble_positions[i][0])/2 + nav_bubble_positions[i][0]-nav_canvas_left, (nav_bubble_positions[i][3]-nav_bubble_positions[i][2])/2 + nav_bubble_positions[i][2]-nav_canvas_top]);
}


for (let i = 0; i < nav_bubble.length; i++) {
    nav_bubble[i].addEventListener("click", () => {
        if (display_level != nav_bubble_names[i]) {
            url.searchParams.set('lvl', nav_bubble_names[i]);
            window.history.replaceState({}, '', url);
            display_level = nav_bubble_names[i];
            document.body.scrollIntoView();
            section_header.innerHTML = "<p>My Research: " + display_level +  " friendly version</p>";
            if (display_level == 'everything') {
                section_header.innerHTML = "<p>My Research: in full detail!</p>";
            }
            nav_to = nav_bubble_names.findIndex(element => element == display_level);
            section_levels[i].style.display = "inherit";
            section_levels[nav_selected].style.display = "none";
        }
    });
}