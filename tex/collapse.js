var cb = document.getElementsByClassName("collapse-button");
var i;

for (i = 0; i < cb.length; i++) {
    cb[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.previousElementSibling;
    if (content.style.maxHeight){
        content.style.maxHeight = null;
        this.innerHTML = "Show more";
    } else {
        content.style.maxHeight = "fit-content";
        this.innerHTML = "Show less";
    }
    });
}

var smb = document.getElementsByClassName("small-button");
var i;

for (i = 0; i < smb.length; i++) {
    smb[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.maxHeight){
        content.style.maxHeight = null;
        this.style.borderRadius = "0rem 0rem 0rem 0rem";
        /*this.innerHTML = "Show more";*/
    } else {
        content.style.maxHeight = "fit-content";
        this.style.borderRadius = "1rem 1rem 0rem 0rem";
        /*this.innerHTML = "Show less";*/
    }
    });
}

var sc = document.getElementsByClassName("section-collapsable");
var i;

for (i = 0; i < sc.length; i++) {
    sc[i].style.maxHeight = "0vh";
}

var sb = document.getElementsByClassName("section-button");
var i;

for (i = 0; i < sb.length; i++) {
    sb[i].addEventListener("click", function() {
    var content = this.nextElementSibling;
    if (content.style.maxHeight == "fit-content"){
        content.style.maxHeight = "0vh";
        this.style.transform = "translateX(-0.6rem) translateY(-3.5rem) rotate(90deg)";
        /*this.innerHTML = "Show more";*/
    } else {
        content.style.maxHeight = "fit-content";
        this.style.transform = "translateX(-0.6rem) translateY(-3.5rem) rotate(180deg)";
        /*this.innerHTML = "Show less";*/
    }
    });
}