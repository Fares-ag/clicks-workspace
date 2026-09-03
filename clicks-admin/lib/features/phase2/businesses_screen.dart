import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class BusinessesScreen extends StatelessWidget {
  const BusinessesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Businesses')),
      body: PaginatedListScreen(
        endpoint: EndPoints.businesses,
        emptyMessage: 'No businesses',
        searchHint: 'Search businesses',
        itemBuilder: (context, item) => ListTile(
          title: Text(item['name']?.toString() ?? 'Business'),
          subtitle: Text(item['email']?.toString() ?? ''),
        ),
      ),
    );
  }
}
