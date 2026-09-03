import '../api/dio_helper.dart';

class PaginatedListRepository {
  Future<PaginatedResult> fetch({
    required String endpoint,
    int page = 1,
    int limit = 20,
    String search = '',
    Map<String, String>? filters,
  }) async {
    final query = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (search.isNotEmpty) 'search': search,
      ...?filters,
    };

    final res = await DioHelper.getData(url: endpoint, query: query);
    if (res.statusCode != 200) {
      throw Exception(DioHelper.errorMessage(res) ?? 'Request failed');
    }

    final data = res.data;
    if (data is Map) {
      final items = _extractList(data);
      final pagination = data['pagination'];
      int total = items.length;
      if (pagination is Map && pagination['total'] != null) {
        total = int.tryParse('${pagination['total']}') ?? total;
      } else if (data['total'] != null) {
        total = int.tryParse('${data['total']}') ?? total;
      }
      return PaginatedResult(
        items: items,
        total: total,
        page: page,
      );
    }
    if (data is List) {
      return PaginatedResult(
        items: data.cast<Map<String, dynamic>>(),
        total: data.length,
        page: page,
      );
    }
    return PaginatedResult(items: const [], total: 0, page: page);
  }

  List<Map<String, dynamic>> _extractList(Map data) {
    for (final key in [
      'data',
      'items',
      'results',
      'requests',
      'jobs',
      'leads',
      'technicians',
      'vehicles',
      'customers',
      'businesses',
      'partners',
      'admins',
      'sources',
    ]) {
      final v = data[key];
      if (v is List) {
        return v.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    }
    return [];
  }
}

class PaginatedResult {
  PaginatedResult({
    required this.items,
    required this.total,
    required this.page,
  });

  final List<Map<String, dynamic>> items;
  final int total;
  final int page;
}
