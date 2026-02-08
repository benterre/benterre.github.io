/* -------------------- Image Parallax -------------------- */

const frames = document.querySelectorAll(".div-image");

function updateParallax() {
    frames.forEach(frame => {
        const img = frame.querySelector("img");
        const rect = frame.getBoundingClientRect();

        // distance from center of viewport (stable reference point)
        const viewportCenter = window.innerHeight / 2;
        const frameCenter = rect.top + rect.height / 2;

        const offset = -100 - (frameCenter - viewportCenter) * 0.2;
        img.style.transform = `translateY(${offset}px)`;
    });
}

window.addEventListener("scroll", () => {
    requestAnimationFrame(updateParallax);
});

window.addEventListener("load", updateParallax);


/* -------------------- Caroussel -------------------- */

new Swiper('.swiper', {
  loop: true,
  centeredSlides: true,
  spaceBetween: 10,
  // freeMode: true,

  slidesPerView: 1,

  breakpoints: {
    768: {
      slidesPerView: 2
    },
    1024: {
      slidesPerView: 3
    }
  }
});