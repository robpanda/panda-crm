function handler(event) {
  var request = event.request;
  var uri = request.uri || '/';

  if (uri === '/analytics' || uri === '/analytics/') {
    request.uri = '/analytics/index.html';
    return request;
  }

  if (uri.indexOf('/analytics-assets/') === 0) {
    return request;
  }

  if (uri.indexOf('/analytics/') === 0) {
    var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
    var hasExtension = lastSegment.indexOf('.') !== -1;

    if (!hasExtension) {
      request.uri = '/analytics/index.html';
    }
  }

  return request;
}
