'use client';

// ============================================
// Game Canvas Component — Main game rendering
// ============================================

import React, { useRef, useEffect, useCallback } from 'react';
import { GameEngine, generateObstacleSequence, generateCoinSequence, createPlayer } from '@/game/engine';
import { GameRenderer } from '@/game/renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT, type RoomPlayer, type PlayerUpdateData, PLAYER_COLORS } from '@/game/types';
import { playJumpSound, playSlideSound, playCoinSound, playCrashSound } from '@/game/sounds';

interface GameCanvasProps {
  playerId: string;
  playerName: string;
  playerColor: string;
  seed: number;
  otherPlayers: RoomPlayer[];
  onUpdate: (data: PlayerUpdateData) => void;
  onDied: (finalScore: number) => void;
  onScoreChange: (score: number, distance: number, coins: number) => void;
  isStarted: boolean;
}

export default function GameCanvas({
  playerId,
  playerName,
  playerColor,
  seed,
  otherPlayers,
  onUpdate,
  onDied,
  onScoreChange,
  isStarted,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const otherPlayersRef = useRef<RoomPlayer[]>(otherPlayers);
  const lastUpdateRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Keep other players ref updated
  useEffect(() => {
    otherPlayersRef.current = otherPlayers;
  }, [otherPlayers]);

  // Initialize engine and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const player = createPlayer(playerId, playerName, playerColor);
    const obstacleSeq = generateObstacleSequence(seed);
    const coinSeq = generateCoinSequence(seed);

    const engine = new GameEngine(player, obstacleSeq, coinSeq);
    const renderer = new GameRenderer(ctx);

    engine.onScoreChange = (score, distance, coins) => {
      onScoreChange(score, distance, coins);
    };

    engine.onGameOver = () => {
      playCrashSound();
      onDied(engine.state.player.score);
    };

    engine.onCollectCoin = () => {
      playCoinSound();
    };

    engineRef.current = engine;
    rendererRef.current = renderer;

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [playerId, playerName, playerColor, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the game loop when isStarted becomes true
  useEffect(() => {
    if (!isStarted || !engineRef.current || !rendererRef.current) return;

    const engine = engineRef.current;
    const renderer = rendererRef.current;

    engine.start();

    let lastTime = performance.now();

    function gameLoop(currentTime: number) {
      const delta = Math.min((currentTime - lastTime) / 16.67, 2); // normalize to ~60fps
      lastTime = currentTime;

      engine.update(delta);
      renderer.render(engine.state, otherPlayersRef.current);

      // Send updates at ~20fps to reduce bandwidth
      if (currentTime - lastUpdateRef.current > 50) {
        lastUpdateRef.current = currentTime;
        const p = engine.state.player;
        onUpdate({
          lane: p.lane,
          y: p.y,
          state: p.state,
          score: p.score,
          distance: p.distance,
          coins: p.coins,
          isAlive: p.isAlive,
        });
      }

      if (engine.state.isRunning) {
        animFrameRef.current = requestAnimationFrame(gameLoop);
      } else {
        // One final render
        renderer.render(engine.state, otherPlayersRef.current);
      }
    }

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const engine = engineRef.current;
      if (!engine || !engine.state.isRunning) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          engine.moveLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          engine.moveRight();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ':
          e.preventDefault();
          engine.jump();
          playJumpSound();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          engine.slide();
          playSlideSound();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Touch controls (swipe)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!touchStartRef.current) return;
      const engine = engineRef.current;
      if (!engine || !engine.state.isRunning) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const minSwipe = 30;

      if (absDx > absDy && absDx > minSwipe) {
        if (dx > 0) {
          engine.moveRight();
        } else {
          engine.moveLeft();
        }
      } else if (absDy > absDx && absDy > minSwipe) {
        if (dy < 0) {
          engine.jump();
          playJumpSound();
        } else {
          engine.slide();
          playSlideSound();
        }
      }

      touchStartRef.current = null;
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="w-full max-w-[800px] rounded-xl border border-white/10 shadow-2xl shadow-purple-900/30"
      style={{ imageRendering: 'auto', aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
    />
  );
}
