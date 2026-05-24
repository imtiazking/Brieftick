/**
 * Magic UI ClientTweetCard — client-side tweet fetch wrapper.
 * Requires a React bundler. Static preview uses preview/social-intelligence-tweet-cards.js instead.
 */
"use client";

import { useTweet } from "react-tweet";
import { MagicTweet, TweetNotFound, TweetSkeleton } from "./tweet-card";

export const ClientTweetCard = ({
  id,
  apiUrl,
  fallback = <TweetSkeleton />,
  components,
  fetchOptions,
  onError,
  ...props
}) => {
  const { data, error, isLoading } = useTweet(id, apiUrl, fetchOptions);

  if (isLoading) return fallback;
  if (error || !data) {
    const NotFound = components?.TweetNotFound ?? TweetNotFound;
    return <NotFound error={onError ? onError(error) : error} {...props} />;
  }

  return <MagicTweet tweet={data} {...props} />;
};
