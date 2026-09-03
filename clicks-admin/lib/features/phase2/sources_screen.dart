import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class SourcesScreen extends StatelessWidget {
  const SourcesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sources')),
      body: PaginatedListScreen(
        endpoint: EndPoints.sources,
        emptyMessage: 'No sources',
        searchHint: 'Search sources',
        itemBuilder: (context, item) => ListTile(
          title: Text(item['mainSourceName']?.toString() ?? 'Source'),
          subtitle: Text(item['subSourceName']?.toString() ?? ''),
        ),
      ),
    );
  }
}
