import { render, screen } from '@testing-library/react';
import App from './App';

beforeAll(() => {
  // jsdom has no matchMedia; the city reads prefers-reduced-motion
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
});

test('renders the navbar stops and the city', () => {
  render(<App />);
  ['About', 'Experience', 'Skills', 'Blog', 'Contact'].forEach((label) => {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });
  expect(screen.getByLabelText("Gabriel Esquivel's city")).toBeInTheDocument();
});

test('city exposes its content as plain text', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Technical Skills' })).toBeInTheDocument();
});
