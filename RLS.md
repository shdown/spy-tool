Rate-limited storage
===

The problem
---

The basic problem is to store some data we want using the VK storage API, which is quite cumbersome
to use.

What we have is the following functions:

  * `listKeys() -> Array(String)`

  * `get(keys: Array(String)) -> Array(String)`

  * `set(key: String, value: String)`

All values are effectively limited to 1024 bytes; keys to 100 bytes. There number of entries is
limited to 1000; an entry can be deleted by calling `set` with empty `value`.

The API is rate-limited: if you call `set` more than 1000 times an hour, it will throw an error.

What we need to store
---

As of now, two things:

1. Gathered “statistics” — a mapping from public IDs to (`number of comments`, `time delta`) pairs.

2. Found posts — a mapping from user IDs to (`owner ID`, `post ID`, `comment ID`) triples.

In future, we will also probably need to store the following:

3. List of to-be-stalked users, probably with list of public IDs for each.

4. A mapping from (`user ID`, `public ID`) pairs to the last checked timestamp.

The abstraction
---

The abstraction this module provides on top on this API can be described as a
**“mapping from strings to ordered collections of strings”**, although there are certain limitations
to strings. Concretely, the following methods are provided by the `RateLimitedStorage` class:

  * `write(key, value)`
      Pushes a new string `value` *to the back* of the ordered collection at the key `key`. If there
      is no room for the new value in the storage, an unspecified number of values are popped
      *from the front* of the ordered collection.

  * `read(key)`
      Returns the ordered collection at the key `key` as an array of strings.

The rationale
---

(1024 + 100) * 1000 = 1.07 Mb, so we can just cache everything in memory. Thus, we don’t need to
store “mappings” differently from simple lists of (`key`, `value`) pairs.

The key observation is that we don’t care if lose some number of the oldest “statistics” records;
likewise, we don’t care if we lose some number of the oldest found posts.

So, circular buffer-like semantics (append-only, possibly-overwrite-oldest) is fine for us.

One may see the parallel with
[log-structured file systems](https://en.wikipedia.org/wiki/Log-structured_file_system) here — we
just write the (possibly redundant) updates to the mappings, reading everything on start and
reconstructing the last version of the mapping by sequentially applying the modifications we
encounter in the log.

How it works
---

We assign a unique key to each “thing” we need to store, e.g. `s` for statistics, `p` for posts,
etc.

Then, we assign for each key a quotum for the number of storage API variables; the sum of all the
quota should not be greater than 1000.

For example, we may assign the quotum of 400 to `s` and the quotum of 600 to `p`.

Then, we have the following storage API variables allocated for the key `s`:
`s0`, `s1`, `s2`, …, `s399`.
They may or may not be actually set in any given moment of time.

What we store in those variables is the following:

![Image](https://user-images.githubusercontent.com/5462697/71493273-7a249780-284e-11ea-83d6-dafe00e23f84.png)

*timer* is the time of creation of this storage API variable. We need it in order to be able to
recover where the “end” of the circular buffer is on start: the “current” index is one whose
“timer” is the biggest (latest).

Then, implementing `read` and `write` is mostly straightforward.
