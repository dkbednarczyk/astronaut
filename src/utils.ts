type Dated = {
    data: {
        pubDate: Date;
    };
};

/** Comparator for sorting content entries newest first. */
export const byPubDateDesc = (a: Dated, b: Dated) =>
    b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** Formats a publish date like "January 19, 2026". */
export const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });
