import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OutpostScene } from './scenes/OutpostScene';

export function PhaserGameHost() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const getDpr = () =>
      typeof window !== 'undefined' ? Math.min(2.5, Math.max(1, window.devicePixelRatio || 1)) : 1;

    const getViewportSize = () => ({
      width: Math.max(1, Math.round(window.visualViewport?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight)),
    });

    const initialDpr = getDpr();
    const initial = getViewportSize();

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: Math.max(1, Math.round(initial.width * initialDpr)),
      height: Math.max(1, Math.round(initial.height * initialDpr)),
      backgroundColor: '#060914',
      render: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
      },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        zoom: 1 / initialDpr,
      },
      scene: [OutpostScene],
    };

    const game = new Phaser.Game(config);

    const applyViewportCanvasScale = () => {
      const dpr = getDpr();
      const next = getViewportSize();
      const backingW = Math.max(1, Math.round(next.width * dpr));
      const backingH = Math.max(1, Math.round(next.height * dpr));
      const targetZoom = 1 / dpr;

      if (game.scale) {
        if (Math.abs(game.scale.zoom - targetZoom) > 0.001) {
          game.scale.setZoom(targetZoom);
        }
        if (game.scale.width !== backingW || game.scale.height !== backingH) {
          game.scale.resize(backingW, backingH);
        }
      }
      if (game.canvas) {
        game.canvas.style.width = `${next.width}px`;
        game.canvas.style.height = `${next.height}px`;
      }
    };

    const rafId = window.requestAnimationFrame(applyViewportCanvasScale);

    let resizeTimer: number | undefined;
    const syncScale = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyViewportCanvasScale, 60);
    };

    window.addEventListener('orientationchange', syncScale);
    window.addEventListener('resize', syncScale);
    window.visualViewport?.addEventListener('resize', syncScale);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('orientationchange', syncScale);
      window.removeEventListener('resize', syncScale);
      window.visualViewport?.removeEventListener('resize', syncScale);
      game.destroy(true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-dvh z-0 touch-none select-none overflow-hidden"
      aria-label="Mars 30 Outpost Map"
    />
  );
}
