// Vite fixture adapter; the Next application uses its real image optimizer.
export function getImageProps(props: { src: string; alt: string; width: number; height: number; sizes: string }) {
  return { props };
}
