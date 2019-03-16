(function () {
    var canvas = document.getElementById('canvas'),
            context = canvas.getContext('2d');

    // resize the canvas to fill browser window dynamically
    window.addEventListener('resize', resizeCanvas, false);

    function resizeCanvas() {
        canvas.width = window.innerWidth * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
        canvas.style.transform = 'scale(' + (1 / window.devicePixelRatio) + ')';
        canvas.style.transformOrigin = 'top left';

        /**
         * Your drawings need to be inside this function otherwise they will be reset when 
         * you resize the browser window and the canvas will be cleared.
         */
        drawStuff(); 
    }
    resizeCanvas();

    function drawStuff(timestamp) {
        // do your drawing stuff here
        var canvas = document.getElementById('canvas');
        var context = canvas.getContext('2d');
        window.dungeon.draw(timestamp, context, {x: 0, y: 0, width: canvas.width, height: canvas.height})
    }

    function rAF(timestamp) {
        drawStuff(timestamp);
        requestAnimationFrame(rAF);
    }
    requestAnimationFrame(rAF);
})();
