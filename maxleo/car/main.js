const socket = io("https://www.benterre.com", {reconnection: true});
const sensor1 = document.getElementById("sensor1");
const sensor2 = document.getElementById("sensor2");
const sensor3 = document.getElementById("sensor3");
const sensor4 = document.getElementById("sensor4");
const sensor5 = document.getElementById("sensor5");
const sensor6 = document.getElementById("sensor6");

socket.emit("maxleocar", "No connection to pi 😃");
socket.on("maxleocar-sensors", ({s1,s2,s3,s4,s5,s6}) => {
    console.log({s1,s2,s3,s4,s5,s6})
    if (s1 == "none") {
        sensor1.style.display = "none";
    } else {
        sensor1.style.display = "inherit";
        sensor1.textContent = s1;
    }
    if (s2 == "none") {
        sensor2.style.display = "none";
    } else {
        sensor2.style.display = "inherit";
        sensor2.textContent = s2;
    }
    if (s3 == "none") {
        sensor3.style.display = "none";
    } else {
        sensor3.style.display = "inherit";
        sensor3.textContent = s3;
    }
    if (s4 == "none") {
        sensor4.style.display = "none";
    } else {
        sensor4.style.display = "inherit";
        sensor4.textContent = s4;
    }
    if (s5 == "none") {
        sensor5.style.display = "none";
    } else {
        sensor5.style.display = "inherit";
        sensor5.textContent = s5;
    }
    if (s6 == "none") {
        sensor6.style.display = "none";
    } else {
        sensor6.style.display = "inherit";
        sensor6.textContent = s6;
    }
});

socket.on("maxleocar", (data) => {
    sensor6.textContent = data;
});

document.addEventListener('keydown', (event) => {
    if (event.code === "ArrowDown") {
        socket.emit("maxleocar-move", "back")
    }
})