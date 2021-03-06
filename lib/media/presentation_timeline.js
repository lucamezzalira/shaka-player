/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.media.PresentationTimeline');

goog.require('goog.asserts');
goog.require('shaka.log');



/**
 * Creates a PresentationTimeline.
 *
 * @param {?number} presentationStartTime The wall-clock time, in seconds,
 *   when the presentation started or will start. Only required for live.
 * @param {number} presentationDelay The delay to give the presentation, in
 *   seconds.  Only required for live.
 *
 * @see {shakaExtern.Manifest}
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.PresentationTimeline = function(
    presentationStartTime, presentationDelay) {
  /** @private {?number} */
  this.presentationStartTime_ = presentationStartTime;

  /** @private {number} */
  this.presentationDelay_ = presentationDelay;

  /** @private {number} */
  this.duration_ = Number.POSITIVE_INFINITY;

  /** @private {number} */
  this.segmentAvailabilityDuration_ = Number.POSITIVE_INFINITY;

  /** @private {?number} */
  this.maxSegmentDuration_ = 1;

  /** @private {number} */
  this.maxFirstSegmentStartTime_ = 0;

  /** @private {number} */
  this.clockOffset_ = 0;
};


/**
 * @return {number} The presentation's duration in seconds.
 *   POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getDuration = function() {
  return this.duration_;
};


/**
 * Sets the presentation's duration.
 *
 * @param {number} duration The presentation's duration in seconds.
 *   POSITIVE_INFINITY indicates that the presentation continues indefinitely.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setDuration = function(duration) {
  goog.asserts.assert(duration > 0, 'duration must be > 0');
  this.duration_ = duration;
};


/**
 * Sets the clock offset, which is the the difference between the client's clock
 * and the server's clock, in milliseconds (i.e., serverTime = Date.now() +
 * clockOffset).
 *
 * @param {number} offset The clock offset, in ms.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setClockOffset = function(offset) {
  this.clockOffset_ = offset;
};


/**
 * Gets the presentation's segment availability duration, which is the amount
 * of time, in seconds, that the start of a segment remains available after the
 * live-edge moves past the end of that segment. POSITIVE_INFINITY indicates
 * that segments remain available indefinitely. For example, if your live
 * presentation has a 5 minute DVR window and your segments are 10 seconds long
 * then the segment availability duration should be 4 minutes and 50 seconds.
 *
 * @return {number} The presentation's segment availability duration.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityDuration =
    function() {
  return this.segmentAvailabilityDuration_;
};


/**
 * Sets the presentation's segment availability duration. The segment
 * availability duration should only be set for live.
 *
 * @param {number} segmentAvailabilityDuration The presentation's new segment
 *   availability duration in seconds.
 * @export
 */
shaka.media.PresentationTimeline.prototype.setSegmentAvailabilityDuration =
    function(segmentAvailabilityDuration) {
  goog.asserts.assert(segmentAvailabilityDuration >= 0,
                      'segmentAvailabilityDuration must be >= 0');
  this.segmentAvailabilityDuration_ = segmentAvailabilityDuration;
};


/**
 * Gives PresentationTimeline a Stream's segments so it can size and position
 * the segment availability window, and account for missing segment
 * information. This function should be called once for each Stream (no more,
 * no less).
 *
 * @param {number} periodStartTime
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @export
 */
shaka.media.PresentationTimeline.prototype.notifySegments = function(
    periodStartTime, references) {
  if (references.length == 0)
    return;

  this.maxSegmentDuration_ = references.reduce(
      function(max, r) { return Math.max(max, r.endTime - r.startTime); },
      this.maxSegmentDuration_);

  if (periodStartTime == 0) {
    this.maxFirstSegmentStartTime_ =
        Math.max(this.maxFirstSegmentStartTime_, references[0].startTime);
  }

  shaka.log.v1('notifySegments:',
               'maxSegmentDuration=' + this.maxSegmentDuration_,
               'maxFirstSegmentStartTime=' + this.maxFirstSegmentStartTime_);
};


/**
 * Gives PresentationTimeline a Stream's maximum segment duration so it can
 * size and position the segment availability window. This function should be
 * called once for each Stream (no more, no less), but does not have to be
 * called if notifySegments() is called instead for a particular stream.
 *
 * @param {number} maxSegmentDuration The maximum segment duration for a
 *   particular stream.
 * @export
 */
shaka.media.PresentationTimeline.prototype.notifyMaxSegmentDuration = function(
    maxSegmentDuration) {
  this.maxSegmentDuration_ = Math.max(
      this.maxSegmentDuration_, maxSegmentDuration);

  shaka.log.v1('notifyNewSegmentDuration:',
               'maxSegmentDuration=' + this.maxSegmentDuration_);
};


/**
 * @return {boolean} True if the presentation is live; otherwise, return
 *   false.
 * @export
 */
shaka.media.PresentationTimeline.prototype.isLive = function() {
  return this.duration_ == Number.POSITIVE_INFINITY ||
         this.segmentAvailabilityDuration_ < Number.POSITIVE_INFINITY;
};


/**
 * Gets the presentation's current earliest, available timestamp. This value
 * may be greater than the presentation's current segment availability start
 * time if segment information is missing or does not exist at the beginning of
 * the segment availability window.
 *
 * @return {number} The presentation's current earliest, available timestamp,
 *   in seconds, relative to the start of the presentation.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getEarliestStart = function() {
  var maxFirstSegmentStartTime = Math.min(
      this.maxFirstSegmentStartTime_, this.getSegmentAvailabilityEnd());
  return Math.max(maxFirstSegmentStartTime,
                  this.getSegmentAvailabilityStart());
};


/**
 * Gets the presentation's current segment availability start time. Segments
 * ending at or before this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability start time, in seconds,
 *   relative to the start of the presentation.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityStart =
    function() {
  if (this.segmentAvailabilityDuration_ == Number.POSITIVE_INFINITY)
    return 0;

  var start = this.getSegmentAvailabilityEnd() -
      this.segmentAvailabilityDuration_ - this.presentationDelay_;
  return Math.max(0, start);
};


/**
 * Gets the presentation's current segment availability end time. Segments
 * starting after this time should be assumed to be unavailable.
 *
 * @return {number} The current segment availability end time, in seconds,
 *   relative to the start of the presentation. Always returns the
 *   presentation's duration for video-on-demand.
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSegmentAvailabilityEnd =
    function() {
  if (this.presentationStartTime_ == null || !this.isLive())
    return this.duration_;

  return Math.min(this.getLiveEdge_(), this.duration_);
};


/**
 * Gets the seek range end.
 *
 * @return {number}
 * @export
 */
shaka.media.PresentationTimeline.prototype.getSeekRangeEnd = function() {
  var notYetAvailable = this.duration_ - this.getSegmentAvailabilityEnd();
  var delay;
  if (this.duration_ == Number.POSITIVE_INFINITY ||
      notYetAvailable >= this.presentationDelay_) {
    // Normal live playback or an in-progress recording that is not at its end
    delay = this.presentationDelay_;
  } else {
    // This is not live, or an in-progress recording whose end is available.
    // Allow the user to scrub past the presentation delay
    delay = notYetAvailable;
  }

  return Math.max(0, this.getSegmentAvailabilityEnd() - delay);
};


/**
 * @return {number} The current presentation time in seconds.
 * @private
 */
shaka.media.PresentationTimeline.prototype.getLiveEdge_ = function() {
  goog.asserts.assert(this.presentationStartTime_ != null,
                      'Cannot compute timeline live edge without start time');
  var now = (Date.now() + this.clockOffset_) / 1000.0;
  return Math.max(
      0, now - this.maxSegmentDuration_ - this.presentationStartTime_);
};

