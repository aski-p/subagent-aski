import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PixelAgent } from "../app/components/pixel-agent";

test("renders an original crisp-edge pixel sprite without soft vector effects", () => {
  const html = renderToStaticMarkup(
    <PixelAgent
      primary="#4fac91"
      accent="#1f615d"
      skin="#efbd91"
      category="human"
      variant={3}
      accessory="헤드셋"
      expression="focused"
      roleMark="개"
      status="working"
    />,
  );

  assert.match(html, /viewBox="0 0 24 32"/);
  assert.match(html, /shape-rendering="crispEdges"/);
  assert.match(html, /pixel-agent category-human status-working/);
  assert.match(html, /--pixel-primary:#4fac91/);
  assert.match(html, /data-accessory="헤드셋"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /linearGradient|radialGradient|filter=|blur/);
});

test("category and variant produce distinct sprite anatomy", () => {
  const animal = renderToStaticMarkup(
    <PixelAgent primary="#7788aa" accent="#334455" skin="#ccaa88" category="animal" variant={2} accessory="없음" expression="happy" roleMark="QA" status="idle" />,
  );
  const robot = renderToStaticMarkup(
    <PixelAgent primary="#7788aa" accent="#334455" skin="#bbccdd" category="robot" variant={2} accessory="안테나" expression="cool" roleMark="개" status="blocked" />,
  );

  assert.match(animal, /data-part="animal-ear"/);
  assert.doesNotMatch(animal, /data-part="robot-antenna"/);
  assert.match(robot, /data-part="robot-antenna"/);
  assert.match(robot, /status-blocked/);
});
