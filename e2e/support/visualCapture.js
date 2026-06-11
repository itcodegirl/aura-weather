export async function forceLazyPanelsToPaint(page) {
  await page.addStyleTag({
    content: `
      .bento-nowcast,
      .bento-chart,
      .bento-forecast,
      .bento-alerts,
      .bento-storm,
      .bento-source-health {
        content-visibility: visible !important;
        contain-intrinsic-block-size: auto !important;
      }
    `,
  });
}

