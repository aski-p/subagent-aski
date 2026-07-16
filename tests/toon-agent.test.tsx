import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ToonAgent } from "../app/components/toon-agent";

test("renders a smooth resolution-independent cel-shaded character", () => {
  const html = renderToStaticMarkup(
    <ToonAgent
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

  assert.match(html, /viewBox="0 0 96 128"/);
  assert.match(html, /toon-agent category-human status-working/);
  assert.match(html, /--toon-primary:#4fac91/);
  assert.match(html, /data-accessory="헤드셋"/);
  assert.match(html, /data-signature="human-3"/);
  assert.match(html, /data-anatomy="human-3"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /shape-rendering="crispEdges"|image-rendering/);
});

test("category and variant produce distinct cartoon anatomy", () => {
  const animal = renderToStaticMarkup(
    <ToonAgent primary="#7788aa" accent="#334455" skin="#ccaa88" category="animal" variant={20} accessory="없음" expression="happy" roleMark="QA" status="idle" />,
  );
  const robot = renderToStaticMarkup(
    <ToonAgent primary="#7788aa" accent="#334455" skin="#bbccdd" category="robot" variant={22} accessory="안테나" expression="cool" roleMark="개" status="blocked" />,
  );

  assert.match(animal, /data-anatomy="animal-20"/);
  assert.match(robot, /data-anatomy="robot-22"/);
  assert.notEqual(animal, robot);
  assert.match(robot, /status-blocked/);
});
