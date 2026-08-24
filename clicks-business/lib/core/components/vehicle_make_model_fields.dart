import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../api/dio_helper.dart';
import '../api/end_points.dart';
import '../theme/app_colors.dart';

/// Make / model fields backed by the business portal vehicle catalog.
class VehicleMakeModelFields extends StatefulWidget {
  const VehicleMakeModelFields({
    super.key,
    this.initialMake,
    this.initialModel,
    this.onChanged,
    this.onCatalogReady,
  });

  final String? initialMake;
  final String? initialModel;
  final void Function(String make, String model)? onChanged;
  final void Function(bool catalogAvailable)? onCatalogReady;

  @override
  State<VehicleMakeModelFields> createState() => VehicleMakeModelFieldsState();
}

class VehicleMakeModelFieldsState extends State<VehicleMakeModelFields> {
  final _otherModelCtrl = TextEditingController();
  final _makeCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _makeFocus = FocusNode();
  final _modelFocus = FocusNode();

  List<Map<String, dynamic>> _makes = [];
  List<Map<String, dynamic>> _models = [];
  String? _selectedMake;
  String? _selectedModel;
  bool _modelIsOther = false;
  bool _loadingMakes = true;
  bool _loadingModels = false;

  bool get useCatalog => _makes.isNotEmpty;

  // The visible text always wins over the last committed selection: the user
  // can edit a field after picking from the catalog without ever firing
  // onFieldSubmitted / onEditingComplete, and submitting stale selections
  // would dispatch a job against the wrong vehicle.
  String get make {
    if (!useCatalog) return '';
    return _makeCtrl.text.trim();
  }

  String get model {
    if (!useCatalog) return '';
    final typed = _modelCtrl.text.trim();
    if (_modelIsOther && (typed.isEmpty || typed == 'Other')) {
      return _otherModelCtrl.text.trim();
    }
    return typed;
  }

  @override
  void initState() {
    super.initState();
    _selectedMake = _emptyToNull(widget.initialMake);
    _selectedModel = _emptyToNull(widget.initialModel);
    if (_selectedMake != null) _makeCtrl.text = _selectedMake!;
    if (_selectedModel != null) _modelCtrl.text = _selectedModel!;
    _loadMakes();
  }

  @override
  void dispose() {
    _otherModelCtrl.dispose();
    _makeCtrl.dispose();
    _modelCtrl.dispose();
    _makeFocus.dispose();
    _modelFocus.dispose();
    super.dispose();
  }

  String? _emptyToNull(String? v) {
    final t = v?.trim() ?? '';
    return t.isEmpty ? null : t;
  }

  Future<void> _loadMakes() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.vehicleMakes);
      if (res.statusCode == 200 && res.data is Map) {
        final raw = res.data['makes'];
        if (raw is List) {
          _makes = raw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          _makes.sort(
            (a, b) => (a['makeName']?.toString() ?? '')
                .compareTo(b['makeName']?.toString() ?? ''),
          );
        }
      }
    } catch (_) {
      _makes = [];
    }

    if (!mounted) return;
    setState(() => _loadingMakes = false);
    widget.onCatalogReady?.call(_makes.isNotEmpty);

    final makeNames = _makeNames;
    if (_selectedMake != null && !makeNames.contains(_selectedMake)) {
      _selectedMake = null;
      _selectedModel = null;
      _makeCtrl.clear();
      _modelCtrl.clear();
    } else if (_selectedMake != null) {
      _makeCtrl.text = _selectedMake!;
    }

    if (_selectedMake != null) {
      await _loadModelsForMake(_selectedMake!, preserveModel: widget.initialModel);
    }
  }

  Future<void> _loadModelsForMake(String makeName, {String? preserveModel}) async {
    setState(() => _loadingModels = true);

    String makeId = '';
    for (final m in _makes) {
      if (m['makeName']?.toString() == makeName) {
        makeId = m['_id']?.toString() ?? '';
        break;
      }
    }

    _models = [];
    if (makeId.isNotEmpty) {
      try {
        final res = await DioHelper.getData(
          url: EndPoints.vehicleModelsByMake(makeId),
        );
        if (res.statusCode == 200 && res.data is Map) {
          final raw = res.data['models'];
          if (raw is List) {
            _models = raw
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList();
            _models.sort(
              (a, b) => (a['modelName']?.toString() ?? '')
                  .compareTo(b['modelName']?.toString() ?? ''),
            );
          }
        }
      } catch (_) {
        _models = [];
      }
    }

    final modelNames = _modelNames;
    final initial = _emptyToNull(preserveModel);
    if (initial != null) {
      if (modelNames.contains(initial)) {
        _selectedModel = initial;
        _modelIsOther = false;
        _modelCtrl.text = initial;
      } else {
        _selectedModel = 'Other';
        _modelIsOther = true;
        _modelCtrl.text = 'Other';
        _otherModelCtrl.text = initial;
      }
    }

    if (mounted) {
      setState(() => _loadingModels = false);
      _notifyChanged();
    }
  }

  void _notifyChanged() {
    widget.onChanged?.call(make, model);
  }

  List<String> get _makeNames => _makes
      .map((m) => m['makeName']?.toString() ?? '')
      .where((n) => n.isNotEmpty)
      .toList();

  List<String> get _modelNames {
    final names = _models
        .map((m) => m['modelName']?.toString() ?? '')
        .where((n) => n.isNotEmpty)
        .toList();
    if (!names.contains('Other')) names.add('Other');
    return names;
  }

  bool get _makeInCatalog =>
      _selectedMake != null && _makeNames.contains(_selectedMake);

  InputDecoration _fieldDeco(
    String label, {
    bool enabled = true,
    FocusNode? focusNode,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: enabled ? 'Type to search or scroll' : 'Enter make first',
      hintStyle: GoogleFonts.dmSans(fontSize: 13, color: AppColors.muted),
      suffixIcon: IconButton(
        tooltip: 'Show all',
        icon: const Icon(Icons.arrow_drop_down),
        onPressed: enabled && focusNode != null
            ? () {
                if (focusNode.hasFocus) {
                  focusNode.unfocus();
                }
                focusNode.requestFocus();
              }
            : null,
      ),
      filled: true,
      fillColor: AppColors.field,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  Iterable<String> _filterItems(List<String> items, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return items;
    final starts = items.where((e) => e.toLowerCase().startsWith(q));
    final contains = items.where(
      (e) => !e.toLowerCase().startsWith(q) && e.toLowerCase().contains(q),
    );
    return [...starts, ...contains];
  }

  String? _bestMatch(List<String> items, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return null;
    for (final e in items) {
      if (e.toLowerCase() == q) return e;
    }
    final starts = items.where((e) => e.toLowerCase().startsWith(q)).toList();
    if (starts.length == 1) return starts.first;
    return null;
  }

  void _commitMake(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _selectedMake = null;
        _makeCtrl.clear();
        _selectedModel = null;
        _modelCtrl.clear();
        _modelIsOther = false;
        _otherModelCtrl.clear();
        _models = [];
      });
      _notifyChanged();
      return;
    }

    final match = _bestMatch(_makeNames, trimmed);
    final resolved = match ?? trimmed;
    setState(() {
      _selectedMake = resolved;
      _makeCtrl.text = resolved;
      _selectedModel = null;
      _modelCtrl.clear();
      _modelIsOther = false;
      _otherModelCtrl.clear();
    });
    if (_makeNames.contains(resolved)) {
      _loadModelsForMake(resolved);
    } else {
      setState(() {
        _models = [];
        _loadingModels = false;
      });
      _notifyChanged();
    }
  }

  void _commitModel(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _selectedModel = null;
        _modelCtrl.clear();
        _modelIsOther = false;
        _otherModelCtrl.clear();
      });
      _notifyChanged();
      return;
    }

    final match = _bestMatch(_modelNames, trimmed);
    final resolved = match ?? trimmed;
    setState(() {
      _selectedModel = resolved;
      _modelCtrl.text = resolved;
      _modelIsOther = resolved == 'Other';
      if (!_modelIsOther) _otherModelCtrl.clear();
    });
    _notifyChanged();
  }

  Widget _searchable({
    required String label,
    required TextEditingController controller,
    required FocusNode focusNode,
    required List<String> items,
    required ValueChanged<String> onSelected,
    bool enabled = true,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: RawAutocomplete<String>(
        textEditingController: controller,
        focusNode: focusNode,
        optionsBuilder: (value) {
          if (!enabled) return const Iterable<String>.empty();
          return _filterItems(items, value.text);
        },
        onSelected: onSelected,
        displayStringForOption: (v) => v,
        fieldViewBuilder: (context, textController, fieldFocus, onFieldSubmitted) {
          return TextFormField(
            controller: textController,
            focusNode: fieldFocus,
            enabled: enabled,
            style: GoogleFonts.dmSans(color: AppColors.text),
            decoration: _fieldDeco(
              label,
              enabled: enabled,
              focusNode: fieldFocus,
            ),
            onChanged: (_) => _notifyChanged(),
            onFieldSubmitted: (value) {
              onSelected(value);
              onFieldSubmitted();
            },
            onEditingComplete: () => onSelected(textController.text),
          );
        },
        optionsViewBuilder: (context, onOptionSelected, options) {
          final list = options.toList();
          return Align(
            alignment: Alignment.topLeft,
            child: Material(
              elevation: 6,
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240, minWidth: 280),
                child: list.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          'No matches — press enter to use typed value',
                          style: GoogleFonts.dmSans(color: AppColors.muted),
                        ),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.zero,
                        shrinkWrap: true,
                        itemCount: list.length,
                        itemBuilder: (context, index) {
                          final option = list[index];
                          return ListTile(
                            dense: true,
                            title: Text(
                              option,
                              style: GoogleFonts.dmSans(color: AppColors.text),
                            ),
                            onTap: () => onOptionSelected(option),
                          );
                        },
                      ),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingMakes) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: LinearProgressIndicator(minHeight: 2),
      );
    }

    if (!useCatalog) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          'Vehicle catalog unavailable — enter make and model manually.',
          style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
        ),
      );
    }

    final showCatalogModels = _makeInCatalog && _models.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _searchable(
          label: 'Vehicle Make*',
          controller: _makeCtrl,
          focusNode: _makeFocus,
          items: _makeNames,
          onSelected: _commitMake,
        ),
        if (_loadingModels)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: LinearProgressIndicator(minHeight: 2),
          )
        else if (showCatalogModels)
          _searchable(
            label: 'Vehicle Model*',
            controller: _modelCtrl,
            focusNode: _modelFocus,
            items: _modelNames,
            enabled: make.isNotEmpty,
            onSelected: _commitModel,
          )
        else if (make.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextFormField(
              controller: _modelCtrl,
              style: GoogleFonts.dmSans(color: AppColors.text),
              decoration: _fieldDeco('Vehicle Model*'),
              onChanged: (value) {
                _selectedModel = value;
                _modelIsOther = false;
                _notifyChanged();
              },
            ),
          ),
        if (_modelIsOther)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextFormField(
              controller: _otherModelCtrl,
              style: GoogleFonts.dmSans(color: AppColors.text),
              decoration: _fieldDeco('Specify model*'),
              onChanged: (_) => _notifyChanged(),
            ),
          ),
      ],
    );
  }
}

/// Fallback text fields when catalog API is unavailable.
class VehicleMakeModelTextFields extends StatelessWidget {
  const VehicleMakeModelTextFields({
    super.key,
    required this.makeController,
    required this.modelController,
  });

  final TextEditingController makeController;
  final TextEditingController modelController;

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String label) => InputDecoration(
          labelText: label,
          filled: true,
          fillColor: AppColors.field,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        );

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextFormField(
            controller: makeController,
            style: GoogleFonts.dmSans(color: AppColors.text),
            decoration: deco('Vehicle Make*'),
          ),
        ),
        TextFormField(
          controller: modelController,
          style: GoogleFonts.dmSans(color: AppColors.text),
          decoration: deco('Vehicle Model*'),
        ),
      ],
    );
  }
}
