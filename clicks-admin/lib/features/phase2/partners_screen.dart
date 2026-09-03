import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class PartnersScreen extends StatelessWidget {
  const PartnersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Partners')),
      body: PaginatedListScreen(
        endpoint: EndPoints.partners,
        emptyMessage: 'No partners',
        searchHint: 'Search partners',
        itemBuilder: (context, item) => ListTile(
          title: Text(item['name']?.toString() ?? 'Partner'),
          subtitle: Text(item['phone']?.toString() ?? ''),
        ),
      ),
    );
  }
}
