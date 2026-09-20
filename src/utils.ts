type Dated = {
  data: {
    pubDate: Date;
  };
};

/** Comparator for sorting content entries newest first. */
export const byPubDateDesc = (a: Dated, b: Dated) =>
  b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
