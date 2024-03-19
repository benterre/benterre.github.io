var r = document.querySelector(':root');
var sb = document.getElementsByClassName("section-button");
var dmsvg = document.getElementById("svg-darkmode");
var mathematicaCodeSection = document.getElementsByClassName("language-mathematica");

r.style.setProperty('--dark-color', 'rgb(10,10,10)');//make light/dark mode default

function darkMode() {
    var rs = getComputedStyle(r);
    if (rs.getPropertyValue('--dark-color')=="rgb(10,10,10)") {
    document.body.style.color = "white";
    r.style.setProperty('--light-color', 'rgb(10,10,10)');
    r.style.setProperty('--light-color-2', 'rgb(50,50,50)');
    r.style.setProperty('--dark-color', 'white');
    r.style.setProperty('--dark-color-2', 'rgb(245,245,245)');

    dmsvg.style.filter = "invert(100%)";
    var i;
    for (i = 0; i < sb.length; i++) {
        sb[i].style.filter = "invert(100%)";
    }
    var i;
    for (i = 0; i < mathematicaCodeSection.length; i++) {
        mathematicaCodeSection[i].style.backgroundColor = "var(--light-color-2)";
        mathematicaCodeSection[i].style.color = "white";
    }
    localStorage.setItem("darkMode", "y");
    } else {
    document.body.style.color = "black";
    r.style.setProperty('--dark-color', 'rgb(10,10,10)');
    r.style.setProperty('--dark-color-2', 'rgb(50,50,50)');
    r.style.setProperty('--light-color', 'white');
    r.style.setProperty('--light-color-2', 'rgb(245,245,245)');
    var i;

    dmsvg.style.filter = "invert(0%)";
    for (i = 0; i < sb.length; i++) {
        sb[i].style.filter = "invert(0%)";
    }
    var i;
    for (i = 0; i < mathematicaCodeSection.length; i++) {
        mathematicaCodeSection[i].style.backgroundColor = "var(--light-color-2)";
        mathematicaCodeSection[i].style.color = "black";
    }
    localStorage.setItem("darkMode", "n");
    }
}

const dm = localStorage.getItem('darkMode');
if (dm == "y") {
    var rs = getComputedStyle(r);
    if (rs.getPropertyValue('--dark-color') == "rgb(10,10,10)") {
        darkMode();
    }
} else {
    localStorage.setItem("darkMode", "n");
}