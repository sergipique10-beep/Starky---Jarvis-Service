import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Orb from '@/components/orb/Orb';

vi.mock('three', () => {
  class FakeObject {
    scale = { set: vi.fn() };
    rotation = { x: 0, y: 0 };
  }

  class MockScene {
    add = vi.fn();
  }

  class MockCamera {
    position = { z: 0 };
  }

  class MockRenderer {
    setSize = vi.fn();
    render = vi.fn();
    domElement = document.createElement('canvas');
  }

  class MockMesh {
    scale = { set: vi.fn() };
    rotation = { x: 0, y: 0 };
  }

  return {
    Scene: MockScene,
    PerspectiveCamera: MockCamera,
    WebGLRenderer: MockRenderer,
    SphereGeometry: vi.fn(),
    MeshBasicMaterial: vi.fn(),
    Mesh: MockMesh,
  };
});

describe('Orb', () => {
  it('renders a canvas container for each state without crashing', () => {
    for (const state of ['idle', 'listening', 'thinking', 'speaking'] as const) {
      const { container, unmount } = render(<Orb state={state} />);
      expect(container.querySelector('div')).toBeTruthy();
      unmount();
    }
  });
});
