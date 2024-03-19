const nav_canvas = document.getElementById("nav_canvas");

const nav_bubble = document.getElementsByClassName("nav_bubble");

const sec_header = document.getElementById("section_header");
const sec_research = document.getElementById("section_research");
const sec_education = document.getElementById("section_education");
const sec_accomplishments = document.getElementById("section_accomplishments");
const sec_hobbies = document.getElementById("section_hobbies");

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

var sec_header_top = sec_header.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
var sec_header_bottom = sec_header.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
var sec_research_top = sec_research.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
var sec_research_bottom = sec_research.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
var sec_education_top = sec_education.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
var sec_education_bottom = sec_education.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
var sec_accomplishments_top = sec_accomplishments.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
var sec_accomplishments_bottom = sec_accomplishments.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
var sec_hobbies_top = sec_hobbies.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
var sec_hobbies_bottom = sec_hobbies.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;


function update_sec_position() {
    sec_header_top = sec_header.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
    sec_header_bottom = sec_header.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
    sec_research_top = sec_research.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
    sec_research_bottom = sec_research.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
    sec_education_top = sec_education.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
    sec_education_bottom = sec_education.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
    sec_accomplishments_top = sec_accomplishments.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
    sec_accomplishments_bottom = sec_accomplishments.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
    sec_hobbies_top = sec_hobbies.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
    sec_hobbies_bottom = sec_hobbies.getBoundingClientRect().bottom - document.body.getBoundingClientRect().top;
};

window.addEventListener('resize', () => {
    update_sec_position();

    sec_bubble_positions = [];
    for (let i = 0; i < nav_bubble.length; i++) {
        sec_bubble_positions.push([nav_bubble[i].getBoundingClientRect().left,nav_bubble[i].getBoundingClientRect().right,nav_bubble[i].getBoundingClientRect().top,nav_bubble[i].getBoundingClientRect().bottom]);
    }
});

nav_bubble[0].addEventListener("click", () => {
    sec_header.scrollIntoView({behavior: "smooth"});
});
nav_bubble[1].addEventListener("click", () => {
    sec_research.scrollIntoView({behavior: "smooth"});
});
nav_bubble[2].addEventListener("click", () => {
    sec_education.scrollIntoView({behavior: "smooth"});
});
nav_bubble[3].addEventListener("click", () => {
    sec_accomplishments.scrollIntoView({behavior: "smooth"});
});
nav_bubble[4].addEventListener("click", () => {
    sec_hobbies.scrollIntoView({behavior: "smooth"});
});