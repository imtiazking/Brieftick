/**
 * Magic UI Tweet Card — reference implementation for future React integration.
 * Requires a React bundler (Next.js/Vite). Not loaded by the static preview.
 *
 * Install: npm install react-tweet
 * Docs: https://magicui.design/docs/components/tweet-card
 */
import { Suspense } from "react";
import { enrichTweet } from "react-tweet";
import { getTweet } from "react-tweet/api";
import { cn } from "../../lib/utils";

const Verified = ({ className, ...props }) => (
  <svg viewBox="0 0 24 24" aria-label="Verified" role="img" className={className} {...props}>
    <g>
      <path
        fill="currentColor"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
      />
    </g>
  </svg>
);

export const truncate = (str, length) => {
  if (!str || str.length <= length) return str;
  return `${str.slice(0, length - 3)}...`;
};

const Skeleton = ({ className, ...props }) => (
  <div className={cn("animate-pulse space-y-4 rounded-lg border p-4", className)} {...props}>
    <div className="flex space-x-4">
      <div className="size-10 rounded-full bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-[200px] rounded-md bg-muted" />
        <div className="h-4 w-[150px] rounded-md bg-muted" />
      </div>
    </div>
  </div>
);

export const TweetSkeleton = ({ className, ...props }) => (
  <div className={cn("rounded-lg border bg-card p-4", className)} {...props}>
    <Skeleton />
  </div>
);

export const TweetNotFound = ({ className, ...props }) => (
  <div
    className={cn("flex h-32 items-center justify-center rounded-lg border bg-card p-4 text-muted-foreground", className)}
    {...props}
  >
    Signal not found
  </div>
);

export const TweetHeader = ({ tweet }) => (
  <div className="flex flex-row justify-between tracking-tight">
    <div className="flex items-center space-x-2">
      <img
        alt={tweet.user.name}
        height={48}
        width={48}
        src={tweet.user.profile_image_url_https}
        className="overflow-hidden rounded-full border border-transparent"
      />
      <div>
        <div className="flex items-center whitespace-nowrap font-semibold">
          {truncate(tweet.user.name, 20)}
          {(tweet.user.verified || tweet.user.is_blue_verified) && (
            <Verified className="ml-1 inline size-4 text-blue-500" />
          )}
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-sm text-muted-foreground transition-all duration-200">
            @{truncate(tweet.user.screen_name, 16)}
          </span>
        </div>
      </div>
    </div>
  </div>
);

export const TweetBody = ({ tweet }) => (
  <div className="break-words leading-normal tracking-tighter">
    {tweet.entities.map((entity, idx) => {
      switch (entity.type) {
        case "url":
        case "symbol":
        case "hashtag":
        case "mention":
          return (
            <span key={idx} className="text-sm font-normal text-blue-500">
              {entity.text}
            </span>
          );
        case "text":
          return (
            <span key={idx} className="text-sm font-normal">
              {entity.text}
            </span>
          );
        default:
          return null;
      }
    })}
  </div>
);

export const MagicTweet = ({ tweet, className, ...props }) => {
  const enrichedTweet = enrichTweet(tweet);
  return (
    <div
      className={cn(
        "relative flex size-full max-w-lg flex-col gap-2 overflow-hidden rounded-lg border p-4 backdrop-blur-md",
        className
      )}
      {...props}
    >
      <TweetHeader tweet={enrichedTweet} />
      <TweetBody tweet={enrichedTweet} />
    </div>
  );
};

export const TweetCard = async ({ id, components, fallback = <TweetSkeleton />, onError, ...props }) => {
  const tweet = id
    ? await getTweet(id).catch((err) => {
        if (onError) onError(err);
        else console.error(err);
      })
    : undefined;

  if (!tweet) {
    const NotFound = components?.TweetNotFound ?? TweetNotFound;
    return <NotFound {...props} />;
  }

  return (
    <Suspense fallback={fallback}>
      <MagicTweet tweet={tweet} {...props} />
    </Suspense>
  );
};
